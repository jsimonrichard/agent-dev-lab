import {
  AdlError,
  DEFAULT_AGENT_END_WHEN,
  inspectAgentEndWhen,
  splitStoredSystemPrompt,
  withStoredSystemPrompt,
  type AgentRunHandle,
  type ModelMessage,
  type RunEvent as CoreRunEvent,
  type WorkflowRunHandle,
} from "@agent-dev-lab/core";
import { resolveAdlSqlitePath, sqliteInspectorSessionStore } from "@agent-dev-lab/core";
import { ok } from "@agent-dev-lab/core/result";

import { getLoadedAdlProject } from "#/lib/adl-project.server";
import { getAdlRuntime, getMessageStore, getWorkflowStore } from "#/lib/adl-runtime.server";
import { inspectAgentOutputSchema, inspectAgentTools } from "#/lib/agent/agent-tools";
import { coreMessageToInspector, inspectorMessageToCore } from "#/lib/chat-messages";
import { generatedForkTitle } from "#/lib/memory-scope-label";
import type { ProjectInspectorMeta } from "#/lib/inspector/inspector-types";
import { persistInspectorSession } from "#/lib/inspector/inspector-session-persist.server";
import {
  createMemoryScope,
  getAgentSessionByMemoryScope,
  hydrateDeletedMemoryScopes,
  hydrateInspectorSessions,
  isWorkflowLinkedConversation,
  linkAgentCallId,
  listAgentSessions,
  registerAgentSession,
  registerForkSession,
  renameAgentSessionTitle,
  sessionDisplayTitle,
  setConversationTurnActive,
  touchAgentSession,
  unregisterAgentSession,
  type AgentSession,
} from "#/lib/agent/agent-sessions";
import {
  adaptCoreEventsForWorkflowRun,
  formatInputPreview,
  mapWorkflowRunStatus,
} from "#/lib/event-log/event-adapter";
import { registerShutdownRunHooks } from "#/lib/server-shutdown.server";
import type { InspectorRunSummary, InspectorMessage } from "#/lib/view-model/types";
import { describeWorkflowInput, sampleWorkflowInput } from "#/lib/workflow/workflow-input-schema";

export type { ProjectInspectorMeta };

export function resolveDevMode(): ProjectInspectorMeta["devMode"] {
  if (process.env.ADL_FRAMEWORK_DEV === "1") {
    return "framework-dev";
  }
  if (process.env.ADL_INSPECTOR_SERVE === "1") {
    return "serve";
  }
  return "project-dev";
}

const activeWorkflowRuns = new Map<string, WorkflowRunHandle<unknown>>();
const activeAgentTurns = new Map<
  string,
  Pick<AgentRunHandle, "agentCallId" | "memoryScope" | "cancel"> & {
    result: Promise<unknown>;
  }
>();
let sessionsHydrated = false;

function activeRunCount(): number {
  return activeWorkflowRuns.size + activeAgentTurns.size;
}

async function waitForActiveRuns(): Promise<void> {
  const pending = [
    ...[...activeWorkflowRuns.values()].map((handle) => handle.result),
    ...[...activeAgentTurns.values()].map((handle) => handle.result),
  ];
  if (pending.length === 0) {
    return;
  }
  await Promise.allSettled(pending);
}

async function cancelActiveRuns(): Promise<void> {
  for (const handle of activeWorkflowRuns.values()) {
    handle.cancel();
  }
  for (const handle of activeAgentTurns.values()) {
    handle.cancel();
  }
  // Do not await handle.result — abort is sync; terminal events persist as the
  // run unwinds. Force-shutdown must not block on provider teardown.
}

registerShutdownRunHooks({
  activeCount: activeRunCount,
  waitForActive: waitForActiveRuns,
  cancelActive: cancelActiveRuns,
});

async function inspectorSessionStore() {
  const project = await getLoadedAdlProject();
  return sqliteInspectorSessionStore({ path: resolveAdlSqlitePath(project.root) });
}

async function ensureSessionsHydrated(): Promise<void> {
  if (sessionsHydrated) {
    return;
  }
  sessionsHydrated = true;
  const project = await getLoadedAdlProject();
  const listedAgentIds = new Set(project.listAgentIds());
  const sessionsStore = await inspectorSessionStore();
  hydrateInspectorSessions(
    sessionsStore.list().filter((record) => listedAgentIds.has(record.agentId)),
  );
  hydrateDeletedMemoryScopes(sessionsStore.listDeletedScopes());

  const store = await getWorkflowStore();
  const episodes = await store.listAgentEpisodes();
  // Oldest first so the agent that opened a shared memoryScope owns the session
  // (matches live `registerAgentSessionFromEvent` first-writer behavior).
  for (const episode of [...episodes].reverse()) {
    if (!listedAgentIds.has(episode.agentId)) {
      continue;
    }
    const existing = getAgentSessionByMemoryScope(episode.memoryScope);
    if (existing) {
      if (episode.workflowRunId) {
        existing.workflowRunId = episode.workflowRunId;
      }
      continue;
    }
    registerAgentSession({
      agentCallId: episode.agentCallId,
      agentId: episode.agentId,
      memoryScope: episode.memoryScope,
      title: `Chat · ${episode.agentId}`,
      createdAt: episode.startedAt,
      updatedAt: episode.startedAt,
      workflowRunId: episode.workflowRunId,
    });
  }
}

export async function getProjectInspectorMeta(): Promise<ProjectInspectorMeta> {
  const project = await getLoadedAdlProject();
  const workflowIds = project.listWorkflowIds();
  const workflows = workflowIds.map((id) => {
    const input = project.getWorkflow(id)?.input;
    return {
      id,
      inputFields: describeWorkflowInput(input),
      inputSample: sampleWorkflowInput(input),
    };
  });
  const agents = project.listAgentIds().map((id) => {
    const agent = project.getAgent(id);
    return {
      id,
      tools: inspectAgentTools(agent),
      memoryMode: agent?.memoryKind ?? "custom",
      model: agent?.modelInfo ?? null,
      titleWorkflowId: agent?.titleWorkflowId ?? null,
      endWhen: inspectAgentEndWhen(agent?.endWhen ?? DEFAULT_AGENT_END_WHEN),
      outputSchema: inspectAgentOutputSchema(agent),
      systemPrompt: agent?.systemPrompt ?? ok(""),
      systemPromptPath: agent?.systemPromptPath ?? null,
    };
  });
  return {
    name: project.config.name,
    root: project.root,
    configPath: project.configPath,
    devMode: resolveDevMode(),
    generation: project.generation,
    lastReloadError: project.lastReloadError,
    workflowIds,
    workflows,
    agentIds: agents.map((agent) => agent.id),
    agents,
  };
}

export async function listWorkflowRunSummaries(): Promise<InspectorRunSummary[]> {
  const project = await getLoadedAdlProject();
  const listedWorkflowIds = new Set(project.listWorkflowIds());
  const store = await getWorkflowStore();
  const runs = await store.listRuns();
  const summaries: InspectorRunSummary[] = [];

  for (const run of runs) {
    if (!listedWorkflowIds.has(run.workflowId)) {
      continue;
    }
    const input = await store.getRunInput(run.workflowRunId);
    summaries.push({
      runId: run.workflowRunId,
      workflowId: run.workflowId,
      status: mapWorkflowRunStatus(run.status),
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      inputPreview: formatInputPreview(input),
      title: run.title,
    });
  }

  return summaries.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export async function getWorkflowRunSummary(runId: string): Promise<InspectorRunSummary | null> {
  const store = await getWorkflowStore();
  const run = await store.getRun(runId);
  if (!run) {
    return null;
  }
  const input = await store.getRunInput(runId);
  return {
    runId: run.workflowRunId,
    workflowId: run.workflowId,
    status: mapWorkflowRunStatus(run.status),
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    inputPreview: formatInputPreview(input),
    title: run.title,
  };
}

export async function getWorkflowRunEvents(runId: string): Promise<CoreRunEvent[]> {
  const store = await getWorkflowStore();
  return store.listEvents({ workflowRunId: runId });
}

export async function getWorkflowRunUiEvents(runId: string) {
  const events = await getWorkflowRunEvents(runId);
  return adaptCoreEventsForWorkflowRun(runId, events);
}

export async function startWorkflowRun(
  workflowId: string,
  input: unknown = {},
  title?: string,
): Promise<{ runId: string }> {
  const project = await getLoadedAdlProject();
  await getAdlRuntime();
  const workflow = project.getWorkflow(workflowId);
  if (!workflow) {
    throw new Error(`Unknown workflow: ${workflowId}`);
  }

  let parsedInput = input;
  if (workflow.input) {
    const parsed = workflow.input.safeParse(input);
    if (!parsed.success) {
      throw new AdlError(
        "INVALID_INPUT",
        `Invalid input for workflow "${workflowId}": ${parsed.error.message}`,
      );
    }
    parsedInput = parsed.data;
  }

  const handle = workflow.run(parsedInput);
  activeWorkflowRuns.set(handle.workflowRunId, handle);
  void handle.result
    .catch((error) => {
      // Failures are persisted as workflow_failed / agent_failed for the UI.
      void error;
    })
    .finally(() => {
      activeWorkflowRuns.delete(handle.workflowRunId);
    });

  const trimmedTitle = title?.trim();
  if (trimmedTitle) {
    await applyRunTitleWhenReady(handle.workflowRunId, trimmedTitle);
  }

  return { runId: handle.workflowRunId };
}

async function applyRunTitleWhenReady(runId: string, title: string): Promise<void> {
  const store = await getWorkflowStore();
  const deadline = Date.now() + 1000;
  while (Date.now() < deadline) {
    if (await store.getRun(runId)) {
      await store.setRunTitle(runId, title);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  await store.setRunTitle(runId, title);
}

export function cancelWorkflowRun(runId: string): { cancelled: boolean } {
  const handle = activeWorkflowRuns.get(runId);
  if (!handle) {
    return { cancelled: false };
  }
  handle.cancel();
  return { cancelled: true };
}

export async function getAgentRunEvents(agentCallId: string): Promise<CoreRunEvent[]> {
  const store = await getWorkflowStore();
  return store.listEvents({ agentCallId });
}

export async function loadMessagesForScope(memoryScope: string): Promise<InspectorMessage[]> {
  const store = await getMessageStore();
  const messages = await store.load(memoryScope);
  return messages.map((message, index) => coreMessageToInspector(message, index));
}

export async function loadMessagesForWorkflowRun(runId: string): Promise<{
  messagesByScope: Record<string, InspectorMessage[]>;
  eventSeq: number;
}> {
  const events = await getWorkflowRunEvents(runId);
  const eventSeq = events.reduce((max, event) => Math.max(max, event.runSeq), 0);
  const scopes = new Set<string>();
  for (const event of events) {
    if (event.type === "agent_started" || event.type === "agent_messages_committed") {
      scopes.add(event.memoryScope);
    }
  }

  const store = await getMessageStore();
  const entries = await Promise.all(
    [...scopes].map(async (scope) => {
      const messages = await store.load(scope);
      return [
        scope,
        messages.map((message, index) => coreMessageToInspector(message, index)),
      ] as const;
    }),
  );

  return { messagesByScope: Object.fromEntries(entries), eventSeq };
}

export async function startAgentTurn(options: {
  agentId: string;
  memoryScope: string;
  user: string;
  workflow?: { workflowRunId: string; stepId: string | null };
}): Promise<{ agentCallId: string }> {
  await ensureSessionsHydrated();
  const existingSession = getAgentSessionByMemoryScope(options.memoryScope);
  if (existingSession && isWorkflowLinkedConversation(existingSession)) {
    throw new Error(
      "Conversations linked to a workflow run are read-only. Fork the conversation to continue chatting.",
    );
  }

  const project = await getLoadedAdlProject();
  await getAdlRuntime();
  const agent = project.getAgent(options.agentId);
  if (!agent) {
    throw new Error(`Unknown agent: ${options.agentId}`);
  }

  touchAgentSession(options.memoryScope);
  setConversationTurnActive(options.memoryScope, true);

  const handle = agent.run({
    memoryScope: options.memoryScope,
    user: options.user,
    workflow: options.workflow,
  });
  linkAgentCallId(options.memoryScope, handle.agentCallId);
  activeAgentTurns.set(handle.agentCallId, handle);
  const linked = getAgentSessionByMemoryScope(options.memoryScope);
  if (linked) {
    void persistInspectorSession(linked);
  }

  void handle.result
    .catch((error) => {
      // Failures are persisted as agent_failed for the UI.
      void error;
    })
    .finally(() => {
      activeAgentTurns.delete(handle.agentCallId);
      setConversationTurnActive(options.memoryScope, false);
    });

  return { agentCallId: handle.agentCallId };
}

export async function forkAgentFromWorkflow(options: {
  agentId: string;
  sourceWorkflowId: string;
  sourceRunId: string;
  sourceStepId: string;
  sourceEpisodeId: string;
  sourceMemoryScope: string;
  messages: InspectorMessage[];
}): Promise<{ memoryScope: string }> {
  const memoryScope = createMemoryScope();
  const messageStore = await getMessageStore();

  const coreMessages: ModelMessage[] = options.messages.map(inspectorMessageToCore);
  const fromPayload = splitStoredSystemPrompt(coreMessages);
  const sourceStored = await messageStore.load(options.sourceMemoryScope);
  const sourcePin = splitStoredSystemPrompt(sourceStored);
  const pin = fromPayload.systemPrompt ?? sourcePin.systemPrompt;
  const agentId = fromPayload.systemPrompt ? fromPayload.agentId : sourcePin.agentId;
  const toSave = pin
    ? withStoredSystemPrompt(pin, fromPayload.transcript, { agentId })
    : fromPayload.transcript;

  await messageStore.save(memoryScope, toSave);

  const session = registerForkSession({
    memoryScope,
    agentId: options.agentId,
    title: generatedForkTitle(options.sourceMemoryScope, options.sourceRunId),
    fork: {
      sourceWorkflowId: options.sourceWorkflowId,
      sourceWorkflowRunId: options.sourceRunId,
      sourceStepId: options.sourceStepId,
      sourceAgentCallId: options.sourceEpisodeId,
      sourceMemoryScope: options.sourceMemoryScope,
    },
  });
  await persistInspectorSession(session);

  return { memoryScope };
}

export async function listAgentSessionsForUi(): Promise<AgentSession[]> {
  await ensureSessionsHydrated();
  const project = await getLoadedAdlProject();
  const listedAgentIds = new Set(project.listAgentIds());
  const store = await getWorkflowStore();
  const episodes = await store.listAgentEpisodes();

  const participantsByScope = new Map<string, Set<string>>();
  for (const episode of episodes) {
    if (!listedAgentIds.has(episode.agentId)) {
      continue;
    }
    let agents = participantsByScope.get(episode.memoryScope);
    if (!agents) {
      agents = new Set();
      participantsByScope.set(episode.memoryScope, agents);
    }
    agents.add(episode.agentId);
  }

  const expanded: AgentSession[] = [];
  for (const session of listAgentSessions()) {
    const participants = participantsByScope.get(session.memoryScope);
    const agentIds =
      participants && participants.size > 0
        ? [...participants]
        : listedAgentIds.has(session.agentId)
          ? [session.agentId]
          : [];
    const title = sessionDisplayTitle(session);
    for (const agentId of agentIds) {
      expanded.push({
        ...session,
        agentId,
        title,
      });
    }
  }

  return expanded.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function resolveAgentConversation(
  memoryScope: string,
  options?: { agentId?: string },
) {
  await ensureSessionsHydrated();
  const session = getAgentSessionByMemoryScope(memoryScope);
  if (!session) {
    return null;
  }

  const viewAgentId = options?.agentId ?? session.agentId;
  if (viewAgentId !== session.agentId) {
    // Shared memoryScopes (e.g. shared-scope workflow) keep one session record
    // owned by the first agent; later agents still need to open the same URL.
    if (!(await memoryScopeHasAgentEpisode(memoryScope, viewAgentId))) {
      return null;
    }
  }

  const messages = await loadMessagesForScope(memoryScope);
  const latestAgentCallId = await latestAgentCallIdForScope(memoryScope, viewAgentId);
  return {
    runId: memoryScope,
    agentId: viewAgentId,
    title: sessionDisplayTitle(session),
    messages,
    latestAgentCallId:
      latestAgentCallId ??
      (session.agentCallId.startsWith("pending:") ? null : session.agentCallId),
    workflowLink: await resolveWorkflowLink(session),
    forkSession: session.fork
      ? {
          forkId: memoryScope,
          agentId: viewAgentId,
          sourceWorkflowId: session.fork.sourceWorkflowId,
          sourceRunId: session.fork.sourceWorkflowRunId,
          sourceStepId: session.fork.sourceStepId,
          sourceEpisodeId: session.fork.sourceAgentCallId,
          sourceMemoryScope: session.fork.sourceMemoryScope,
          createdAt: session.createdAt,
          messages,
        }
      : null,
  };
}

async function memoryScopeHasAgentEpisode(memoryScope: string, agentId: string): Promise<boolean> {
  const store = await getWorkflowStore();
  const episodes = await store.listAgentEpisodes({ agentId });
  return episodes.some((episode) => episode.memoryScope === memoryScope);
}

async function latestAgentCallIdForScope(
  memoryScope: string,
  agentId: string,
): Promise<string | null> {
  const store = await getWorkflowStore();
  const episodes = await store.listAgentEpisodes({ agentId });
  const match = episodes.find((episode) => episode.memoryScope === memoryScope);
  return match?.agentCallId ?? null;
}

export async function forkLinkedAgentConversation(
  memoryScope: string,
  options?: { agentId?: string },
): Promise<{ memoryScope: string }> {
  await ensureSessionsHydrated();
  const session = getAgentSessionByMemoryScope(memoryScope);
  if (!session || !isWorkflowLinkedConversation(session)) {
    throw new Error("Only conversations linked to a workflow run can be forked.");
  }
  const forkAgentId = options?.agentId ?? session.agentId;
  if (forkAgentId !== session.agentId) {
    if (!(await memoryScopeHasAgentEpisode(memoryScope, forkAgentId))) {
      throw new Error(`Agent "${forkAgentId}" did not run on this conversation.`);
    }
  }
  const link = await resolveWorkflowLink(session);
  if (!link) {
    throw new Error("Could not resolve the connected workflow run.");
  }
  const messages = await loadMessagesForScope(memoryScope);
  return forkAgentFromWorkflow({
    agentId: forkAgentId,
    sourceWorkflowId: link.workflowId,
    sourceRunId: link.workflowRunId,
    sourceStepId: link.stepId ?? link.episodeId,
    sourceEpisodeId: link.episodeId,
    sourceMemoryScope: session.memoryScope,
    messages,
  });
}

async function resolveWorkflowLink(session: AgentSession) {
  if (!isWorkflowLinkedConversation(session) || !session.workflowRunId) {
    return null;
  }
  const store = await getWorkflowStore();
  const run = await store.getRun(session.workflowRunId);
  if (!run) {
    return null;
  }
  const episodes = await store.listAgentEpisodes({ agentId: session.agentId });
  const episode =
    episodes.find((item) => item.memoryScope === session.memoryScope) ??
    episodes.find((item) => item.agentCallId === session.agentCallId);
  return {
    workflowId: run.workflowId,
    workflowRunId: session.workflowRunId,
    stepId: episode?.stepId ?? null,
    episodeId: episode?.agentCallId ?? session.agentCallId,
  };
}

export async function createStandaloneAgentSession(
  agentId: string,
): Promise<{ memoryScope: string }> {
  const memoryScope = createMemoryScope();
  const now = new Date().toISOString();
  const session = {
    agentCallId: `pending:${memoryScope}`,
    agentId,
    memoryScope,
    title: `New ${agentId} chat`,
    createdAt: now,
    updatedAt: now,
  };
  registerAgentSession(session);
  await persistInspectorSession(session);
  return { memoryScope };
}

export async function renameAgentSession(
  memoryScope: string,
  title: string,
): Promise<{ memoryScope: string; title: string }> {
  await ensureSessionsHydrated();
  const trimmed = title.trim();
  if (!trimmed) {
    throw new Error("Title is required");
  }
  const session = renameAgentSessionTitle(memoryScope, trimmed);
  if (!session) {
    throw new Error(`Unknown conversation: ${memoryScope}`);
  }
  await persistInspectorSession(session);
  return { memoryScope, title: session.title };
}

export async function deleteAgentSession(memoryScope: string): Promise<{ memoryScope: string }> {
  await ensureSessionsHydrated();
  const session = getAgentSessionByMemoryScope(memoryScope);
  if (!session) {
    throw new Error(`Unknown conversation: ${memoryScope}`);
  }
  if (isWorkflowLinkedConversation(session)) {
    throw new Error(
      "Conversations linked to a workflow run cannot be deleted. Delete the workflow run instead.",
    );
  }
  const now = new Date().toISOString();
  session.updatedAt = now;
  await persistInspectorSession(session, now);
  const messageStore = await getMessageStore();
  await messageStore.delete(memoryScope);
  unregisterAgentSession(memoryScope);
  return { memoryScope };
}

export async function renameWorkflowRun(
  runId: string,
  title: string,
): Promise<{ runId: string; title: string }> {
  const trimmed = title.trim();
  if (!trimmed) {
    throw new Error("Title is required");
  }
  const store = await getWorkflowStore();
  const run = await store.getRun(runId);
  if (!run) {
    throw new Error(`Unknown workflow run: ${runId}`);
  }
  await store.setRunTitle(runId, trimmed);
  return { runId, title: trimmed };
}

export async function deleteWorkflowRun(runId: string): Promise<{ runId: string }> {
  await ensureSessionsHydrated();
  cancelWorkflowRun(runId);
  const store = await getWorkflowStore();
  const run = await store.getRun(runId);
  if (!run) {
    throw new Error(`Unknown workflow run: ${runId}`);
  }

  const linkedSessions = listAgentSessions().filter(
    (session) => isWorkflowLinkedConversation(session) && session.workflowRunId === runId,
  );
  const now = new Date().toISOString();
  for (const session of linkedSessions) {
    session.updatedAt = now;
    await persistInspectorSession(session, now);
    unregisterAgentSession(session.memoryScope);
  }

  await store.deleteRun(runId);
  return { runId };
}
