import type { RunEvent } from "@agent-dev-lab/core";

export interface AgentSession {
  agentCallId: string;
  agentId: string;
  memoryScope: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  /** When forked from a workflow step. */
  fork?: {
    sourceWorkflowId: string;
    sourceWorkflowRunId: string;
    sourceStepId: string;
    sourceAgentCallId: string;
    sourceMemoryScope: string;
  };
}

const byMemoryScope = new Map<string, AgentSession>();
const byAgentCallId = new Map<string, AgentSession>();

export function registerAgentSessionFromEvent(event: RunEvent): void {
  if (event.type !== "agent_started") {
    return;
  }

  const pending = byMemoryScope.get(event.memoryScope);
  if (pending) {
    linkAgentCallId(event.memoryScope, event.agentCallId);
    pending.updatedAt = event.at;
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
  };
  byMemoryScope.set(event.memoryScope, session);
  byAgentCallId.set(event.agentCallId, session);
}

export function registerAgentSession(session: AgentSession): void {
  byMemoryScope.set(session.memoryScope, session);
  byAgentCallId.set(session.agentCallId, session);
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

export function createMemoryScope(prefix = "inspector"): string {
  return `${prefix}:${Date.now().toString(36)}`;
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
