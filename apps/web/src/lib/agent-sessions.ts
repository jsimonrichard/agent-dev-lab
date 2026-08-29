import type { InspectorSessionRecord, RunEvent } from "@agent-dev-lab/core";

import { displayConversationTitle } from "./memory-scope-label";

export interface AgentSession {
  agentCallId: string;
  agentId: string;
  memoryScope: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  /** Present when this conversation ran inside a workflow (not a standalone chat). */
  workflowRunId?: string;
  /** When forked from a workflow step. */
  fork?: {
    sourceWorkflowId: string;
    sourceWorkflowRunId: string;
    sourceStepId: string;
    sourceAgentCallId: string;
    sourceMemoryScope: string;
  };
}

/** Workflow registry id when this conversation is tied to a workflow (in-run or fork). */
export function workflowIdForAgentSession(
  session: Pick<AgentSession, "workflowRunId" | "fork">,
  runs: ReadonlyArray<{ runId: string; workflowId: string }>,
): string | undefined {
  if (session.fork?.sourceWorkflowId) {
    return session.fork.sourceWorkflowId;
  }
  if (!session.workflowRunId) {
    return undefined;
  }
  return runs.find((run) => run.runId === session.workflowRunId)?.workflowId;
}

/** True when this conversation belongs to a workflow run (not a standalone chat or fork). */
export function isWorkflowLinkedConversation(
  session: Pick<AgentSession, "workflowRunId" | "fork">,
): boolean {
  return Boolean(session.workflowRunId && !session.fork);
}

/** Target for `/workflows/$workflowId/run/$runId` when this conversation ran inside a workflow. */
export function workflowRunLocationForSession(
  session: Pick<AgentSession, "workflowRunId" | "fork">,
  runs: ReadonlyArray<{ runId: string; workflowId: string }>,
): { workflowId: string; runId: string } | undefined {
  if (session.fork || !session.workflowRunId) {
    return undefined;
  }
  const workflowId = workflowIdForAgentSession(session, runs);
  if (!workflowId) {
    return undefined;
  }
  return { workflowId, runId: session.workflowRunId };
}

/** Agent id, with workflow name when the conversation is connected to a workflow. */
export function formatAgentSessionIdentity(
  session: AgentSession,
  runs: ReadonlyArray<{ runId: string; workflowId: string }>,
): string {
  const workflowId = workflowIdForAgentSession(session, runs);
  return workflowId ? `${session.agentId} · ${workflowId}` : session.agentId;
}

export function sessionDisplayTitle(session: Pick<AgentSession, "title" | "fork">): string {
  return displayConversationTitle(
    session.title,
    session.fork
      ? {
          sourceEpisodeId: session.fork.sourceAgentCallId,
          sourceMemoryScope: session.fork.sourceMemoryScope,
          sourceRunId: session.fork.sourceWorkflowRunId,
        }
      : null,
  );
}

/** True when the title is still the inspector default, not a user or auto-generated name. */
export function isPlaceholderConversationTitle(title: string, agentId: string): boolean {
  const trimmed = title.trim();
  return trimmed === `New ${agentId} chat` || trimmed === `Chat · ${agentId}`;
}

const byMemoryScope = new Map<string, AgentSession>();
const byAgentCallId = new Map<string, AgentSession>();
const deletedMemoryScopes = new Set<string>();
/** In-process: a conversation composer turn is still looping episodes. Not persisted. */
const conversationTurnActive = new Set<string>();

/**
 * Open a conversation from an `agent_started` event, or apply `agent_title_set`.
 * Pass `listedAgentIds` (the project `agents` registry) to hide helper agents that
 * are not exported — for example a conversation-title namer.
 */
export function registerAgentSessionFromEvent(
  event: RunEvent,
  options?: { listedAgentIds?: ReadonlySet<string> },
): void {
  if (event.type === "agent_title_set") {
    applyGeneratedConversationTitle(event.memoryScope, event.title);
    return;
  }
  if (event.type !== "agent_started") {
    return;
  }
  if (options?.listedAgentIds && !options.listedAgentIds.has(event.agentId)) {
    return;
  }
  if (deletedMemoryScopes.has(event.memoryScope)) {
    return;
  }

  const pending = byMemoryScope.get(event.memoryScope);
  if (pending) {
    linkAgentCallId(event.memoryScope, event.agentCallId);
    pending.updatedAt = event.at;
    if (event.workflowRunId) {
      pending.workflowRunId = event.workflowRunId;
    }
    return;
  }

  const existing = byAgentCallId.get(event.agentCallId);
  if (existing) {
    existing.updatedAt = event.at;
    return;
  }

  const session: AgentSession = {
    agentCallId: event.agentCallId,
    agentId: event.agentId,
    memoryScope: event.memoryScope,
    title: `Chat · ${event.agentId}`,
    createdAt: event.at,
    updatedAt: event.at,
    workflowRunId: event.workflowRunId,
  };
  byMemoryScope.set(event.memoryScope, session);
  byAgentCallId.set(event.agentCallId, session);
}

export function registerAgentSession(session: AgentSession): void {
  if (deletedMemoryScopes.has(session.memoryScope)) {
    return;
  }
  byMemoryScope.set(session.memoryScope, session);
  byAgentCallId.set(session.agentCallId, session);
}

export function hydrateInspectorSessions(records: InspectorSessionRecord[]): void {
  for (const record of records) {
    if (byMemoryScope.has(record.memoryScope)) {
      continue;
    }
    registerAgentSession({
      agentCallId: record.agentCallId,
      agentId: record.agentId,
      memoryScope: record.memoryScope,
      title: record.title,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      fork: record.fork,
    });
  }
}

export function getAgentSessionByMemoryScope(memoryScope: string): AgentSession | undefined {
  return byMemoryScope.get(memoryScope);
}

export function getAgentSessionByAgentCallId(agentCallId: string): AgentSession | undefined {
  return byAgentCallId.get(agentCallId);
}

export function listAgentSessions(): AgentSession[] {
  return [...byMemoryScope.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function createMemoryScope(): string {
  return crypto.randomUUID();
}

export function registerForkSession(options: {
  memoryScope: string;
  agentId: string;
  title: string;
  fork: AgentSession["fork"];
}): AgentSession {
  const now = new Date().toISOString();
  const session: AgentSession = {
    agentCallId: `pending:${options.memoryScope}`,
    agentId: options.agentId,
    memoryScope: options.memoryScope,
    title: options.title,
    createdAt: now,
    updatedAt: now,
    fork: options.fork,
  };
  registerAgentSession(session);
  return session;
}

export function hydrateDeletedMemoryScopes(scopes: string[]): void {
  for (const scope of scopes) {
    deletedMemoryScopes.add(scope);
  }
}

export function renameAgentSessionTitle(
  memoryScope: string,
  title: string,
): AgentSession | undefined {
  const session = byMemoryScope.get(memoryScope);
  if (!session) {
    return undefined;
  }
  session.title = title;
  session.updatedAt = new Date().toISOString();
  return session;
}

/**
 * Apply an auto-generated title from `agent_title_set`. Does not overwrite a
 * user rename or a fork title.
 */
export function applyGeneratedConversationTitle(
  memoryScope: string,
  title: string,
): AgentSession | undefined {
  const session = byMemoryScope.get(memoryScope);
  if (!session) {
    return undefined;
  }
  if (!isPlaceholderConversationTitle(session.title, session.agentId)) {
    return session;
  }
  const trimmed = title.trim();
  if (!trimmed) {
    return session;
  }
  session.title = trimmed;
  session.updatedAt = new Date().toISOString();
  return session;
}

export function unregisterAgentSession(memoryScope: string): AgentSession | undefined {
  const session = byMemoryScope.get(memoryScope);
  deletedMemoryScopes.add(memoryScope);
  conversationTurnActive.delete(memoryScope);
  if (!session) {
    return undefined;
  }
  byMemoryScope.delete(memoryScope);
  byAgentCallId.delete(session.agentCallId);
  return session;
}

export function touchAgentSession(memoryScope: string): void {
  const session = byMemoryScope.get(memoryScope);
  if (session) {
    session.updatedAt = new Date().toISOString();
  }
}

export function linkAgentCallId(memoryScope: string, agentCallId: string): void {
  const session = byMemoryScope.get(memoryScope);
  if (!session) {
    return;
  }
  if (session.agentCallId.startsWith("pending:")) {
    byAgentCallId.delete(session.agentCallId);
  }
  session.agentCallId = agentCallId;
  byAgentCallId.set(agentCallId, session);
  session.updatedAt = new Date().toISOString();
}

/** Mark a standalone chat as running `agent.run()` (including its tool loop). */
export function setConversationTurnActive(memoryScope: string, active: boolean): void {
  if (active) {
    conversationTurnActive.add(memoryScope);
  } else {
    conversationTurnActive.delete(memoryScope);
  }
}

export function isConversationTurnActive(memoryScope: string): boolean {
  return conversationTurnActive.has(memoryScope);
}
