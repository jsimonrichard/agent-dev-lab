import type { CoreMessage, RunEvent as CoreRunEvent } from "@agent-dev-lab/core";

import { getLoadedAdlProject } from "#/lib/adl-project";
import { getMessageStore, getWorkflowStore } from "#/lib/adl-runtime";
import {
  createMemoryScope,
  getAgentSessionByMemoryScope,
  linkAgentCallId,
  listAgentSessions,
  registerAgentSession,
  registerForkSession,
  touchAgentSession,
  type AgentSession,
} from "#/lib/agent-sessions";
import {
  adaptCoreEventsForWorkflowRun,
  formatInputPreview,
  mapWorkflowRunStatus,
} from "#/lib/event-adapter";
import type { MockRunSummary, MockMessage } from "#/lib/mock/types";

export interface ProjectInspectorMeta {
  name: string;
  root: string;
  configPath: string;
  devMode: "framework-dev" | "project-dev" | "serve";
  workflowIds: string[];
  agentIds: string[];
}

export function resolveDevMode(): ProjectInspectorMeta["devMode"] {
  if (process.env.ADL_FRAMEWORK_DEV === "1") {
    return "framework-dev";
  }
  return "project-dev";
}

export async function getProjectInspectorMeta(): Promise<ProjectInspectorMeta> {
  const project = await getLoadedAdlProject();
  return {
    name: project.config.name,
    root: project.root,
    configPath: project.configPath,
    devMode: resolveDevMode(),
    workflowIds: project.listWorkflowIds(),
    agentIds: project.listAgentIds(),
  };
}

export async function listWorkflowRunSummaries(): Promise<MockRunSummary[]> {
  const store = await getWorkflowStore();
  const runs = await store.listRuns();
  const summaries: MockRunSummary[] = [];

  for (const run of runs) {
    const input = await store.getRunInput(run.workflowRunId);
    summaries.push({
      runId: run.workflowRunId,
      workflowId: run.workflowId,
      status: mapWorkflowRunStatus(run.status),
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      inputPreview: formatInputPreview(input),
    });
  }

  return summaries.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export async function getWorkflowRunSummary(runId: string): Promise<MockRunSummary | null> {
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
): Promise<{ runId: string }> {
  const project = await getLoadedAdlProject();
  const workflow = project.getWorkflow(workflowId);
  if (!workflow) {
    throw new Error(`Unknown workflow: ${workflowId}`);
  }

  const handle = workflow.run(input);
  void handle.result.catch((error) => {
    console.warn(`[adl-web] workflow run ${handle.workflowRunId} failed:`, error);
  });

  return { runId: handle.workflowRunId };
}

export async function getAgentRunEvents(agentCallId: string): Promise<CoreRunEvent[]> {
  const store = await getWorkflowStore();
  return store.listEvents({ agentCallId });
}

export async function loadMessagesForScope(memoryScope: string): Promise<MockMessage[]> {
  const store = await getMessageStore();
  const messages = await store.load(memoryScope);
  return messages.map((m, index) => coreMessageToMock(m, index));
}

function coreMessageToMock(message: CoreMessage, index: number): MockMessage {
  const role =
    message.role === "system" || message.role === "user" || message.role === "assistant"
      ? message.role
      : "assistant";
  const content =
    typeof message.content === "string"
      ? message.content
      : Array.isArray(message.content)
        ? message.content.map((part) => ("text" in part && part.text ? part.text : "")).join("")
        : JSON.stringify(message.content);

  return {
    id: `msg-${index}`,
    role,
    content: content || "",
  };
}

export async function startAgentTurn(options: {
  agentId: string;
  memoryScope: string;
  user: string;
  workflow?: { workflowRunId: string; stepId: string | null };
}): Promise<{ agentCallId: string }> {
  const project = await getLoadedAdlProject();
  const agent = project.getAgent(options.agentId);
  if (!agent) {
    throw new Error(`Unknown agent: ${options.agentId}`);
  }

  touchAgentSession(options.memoryScope);

  const handle = agent.run({
    memoryScope: options.memoryScope,
    user: options.user,
    workflow: options.workflow,
  });

  linkAgentCallId(options.memoryScope, handle.agentCallId);

  void handle.result.catch((error) => {
    console.warn(`[adl-web] agent run failed for ${options.memoryScope}:`, error);
  });

  return { agentCallId: handle.agentCallId };
}

export function createForkMemoryScope(): string {
  return createMemoryScope("fork");
}

export async function forkAgentFromWorkflow(options: {
  agentId: string;
  sourceWorkflowId: string;
  sourceRunId: string;
  sourceStepId: string;
  sourceEpisodeId: string;
  sourceMemoryScope: string;
  messages: MockMessage[];
}): Promise<{ memoryScope: string }> {
  const memoryScope = createForkMemoryScope();
  const messageStore = await getMessageStore();

  const coreMessages: CoreMessage[] = options.messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  await messageStore.save(memoryScope, coreMessages);

  registerForkSession({
    memoryScope,
    agentId: options.agentId,
    title: `Fork · ${options.sourceEpisodeId}`,
    fork: {
      sourceWorkflowId: options.sourceWorkflowId,
      sourceWorkflowRunId: options.sourceRunId,
      sourceStepId: options.sourceStepId,
      sourceAgentCallId: options.sourceEpisodeId,
      sourceMemoryScope: options.sourceMemoryScope,
    },
  });

  return { memoryScope };
}

export function listAgentSessionsForUi(): AgentSession[] {
  return listAgentSessions();
}

export async function resolveAgentConversation(memoryScope: string) {
  const session = getAgentSessionByMemoryScope(memoryScope);
  if (!session) {
    return null;
  }
  const messages = await loadMessagesForScope(memoryScope);
  return {
    runId: memoryScope,
    agentId: session.agentId,
    title: session.title,
    messages,
    forkSession: session.fork
      ? {
          forkId: memoryScope,
          agentId: session.agentId,
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

export function createStandaloneAgentSession(agentId: string): { memoryScope: string } {
  const memoryScope = createMemoryScope("conv");
  const now = new Date().toISOString();
  registerAgentSession({
    agentCallId: `pending:${memoryScope}`,
    agentId,
    memoryScope,
    title: `New ${agentId} chat`,
    createdAt: now,
    updatedAt: now,
  });
  return { memoryScope };
}
