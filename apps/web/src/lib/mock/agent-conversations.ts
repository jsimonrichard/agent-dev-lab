import { mockAgentConversations, mockConversations } from "./data";
import type {
  ForkedAgentSession,
  MockAgentConversation,
  MockMessage,
  ResolvedAgentConversation,
} from "./types";

const forks = new Map<string, ForkedAgentSession>();
const standalone = new Map<
  string,
  { agentId: string; messages: MockMessage[]; createdAt: string }
>();

export function createForkedSession(options: {
  agentId: string;
  sourceRunId: string;
  sourceStepId: string;
  sourceEpisodeId: string;
  sourceMemoryScope: string;
  messages: MockMessage[];
}): ForkedAgentSession {
  const forkId = `fork_${Date.now().toString(36)}`;
  const session: ForkedAgentSession = {
    forkId,
    agentId: options.agentId,
    sourceRunId: options.sourceRunId,
    sourceStepId: options.sourceStepId,
    sourceEpisodeId: options.sourceEpisodeId,
    sourceMemoryScope: options.sourceMemoryScope,
    createdAt: new Date().toISOString(),
    messages: options.messages.map((m) => ({ ...m, id: `${forkId}:${m.id}` })),
  };
  forks.set(forkId, session);
  return session;
}

export function createStandaloneConversation(agentId: string): MockAgentConversation {
  const runId = `conv_${Date.now().toString(36)}`;
  const createdAt = new Date().toISOString();
  standalone.set(runId, { agentId, messages: [], createdAt });
  return {
    runId,
    agentId,
    title: `New ${agentId} chat`,
    preview: "No messages yet",
    updatedAt: createdAt,
    memoryScope: `standalone:${runId}`,
  };
}

export function getForkedSession(forkId: string): ForkedAgentSession | undefined {
  return forks.get(forkId);
}

export function appendAgentRunMessage(
  runId: string,
  message: MockMessage,
): ResolvedAgentConversation | undefined {
  const fork = forks.get(runId);
  if (fork) {
    fork.messages.push(message);
    return resolveAgentConversation(runId);
  }
  const session = standalone.get(runId);
  if (session) {
    session.messages.push(message);
    return resolveAgentConversation(runId);
  }
  return undefined;
}

export function listAgentConversations(): MockAgentConversation[] {
  const forkItems: MockAgentConversation[] = Array.from(forks.values()).map((f) => ({
    runId: f.forkId,
    agentId: f.agentId,
    title: `Fork · ${f.sourceEpisodeId}`,
    preview: lastMessagePreview(f.messages),
    updatedAt: f.createdAt,
    memoryScope: f.sourceMemoryScope,
  }));

  const dynamicStandalone: MockAgentConversation[] = Array.from(standalone.entries()).map(
    ([runId, s]) => ({
      runId,
      agentId: s.agentId,
      title: `New ${s.agentId} chat`,
      preview: lastMessagePreview(s.messages),
      updatedAt: s.createdAt,
      memoryScope: `standalone:${runId}`,
    }),
  );

  return [...mockAgentConversations, ...forkItems, ...dynamicStandalone].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
}

export function resolveAgentConversation(runId: string): ResolvedAgentConversation | undefined {
  const fork = forks.get(runId);
  if (fork) {
    return {
      runId: fork.forkId,
      agentId: fork.agentId,
      title: `Fork · ${fork.sourceEpisodeId}`,
      messages: fork.messages,
      forkSession: fork,
    };
  }

  const dynamic = standalone.get(runId);
  if (dynamic) {
    return {
      runId,
      agentId: dynamic.agentId,
      title: `New ${dynamic.agentId} chat`,
      messages: dynamic.messages,
      forkSession: null,
    };
  }

  const summary = mockAgentConversations.find((c) => c.runId === runId);
  if (!summary) return undefined;

  const transcript = mockConversations[summary.memoryScope];
  return {
    runId: summary.runId,
    agentId: summary.agentId,
    title: summary.title,
    messages: transcript?.messages ?? [],
    forkSession: null,
  };
}

export function getDefaultAgentRun(): MockAgentConversation | undefined {
  return listAgentConversations()[0];
}

function lastMessagePreview(messages: MockMessage[]): string {
  const last = [...messages].reverse().find((m) => m.role === "user" || m.role === "assistant");
  if (!last) return "No messages yet";
  const text = last.content.replace(/\s+/g, " ").trim();
  return text.length > 72 ? `${text.slice(0, 72)}…` : text;
}
