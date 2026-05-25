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
  const conversationId = `conv_${Date.now().toString(36)}`;
  const createdAt = new Date().toISOString();
  standalone.set(conversationId, { agentId, messages: [], createdAt });
  return {
    conversationId,
    agentId,
    title: `New ${agentId} chat`,
    preview: "No messages yet",
    updatedAt: createdAt,
    memoryScope: `standalone:${conversationId}`,
  };
}

export function getForkedSession(forkId: string): ForkedAgentSession | undefined {
  return forks.get(forkId);
}

export function appendConversationMessage(
  conversationId: string,
  message: MockMessage,
): ResolvedAgentConversation | undefined {
  const fork = forks.get(conversationId);
  if (fork) {
    fork.messages.push(message);
    return resolveAgentConversation(conversationId);
  }
  const session = standalone.get(conversationId);
  if (session) {
    session.messages.push(message);
    return resolveAgentConversation(conversationId);
  }
  return undefined;
}

export function listAgentConversations(): MockAgentConversation[] {
  const forkItems: MockAgentConversation[] = Array.from(forks.values()).map((f) => ({
    conversationId: f.forkId,
    agentId: f.agentId,
    title: `Fork · ${f.sourceEpisodeId}`,
    preview: lastMessagePreview(f.messages),
    updatedAt: f.createdAt,
    memoryScope: f.sourceMemoryScope,
  }));

  const dynamicStandalone: MockAgentConversation[] = Array.from(standalone.entries()).map(
    ([conversationId, s]) => ({
      conversationId,
      agentId: s.agentId,
      title: `New ${s.agentId} chat`,
      preview: lastMessagePreview(s.messages),
      updatedAt: s.createdAt,
      memoryScope: `standalone:${conversationId}`,
    }),
  );

  return [...mockAgentConversations, ...forkItems, ...dynamicStandalone].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
}

export function resolveAgentConversation(
  conversationId: string,
): ResolvedAgentConversation | undefined {
  const fork = forks.get(conversationId);
  if (fork) {
    return {
      conversationId: fork.forkId,
      agentId: fork.agentId,
      title: `Fork · ${fork.sourceEpisodeId}`,
      messages: fork.messages,
      forkSession: fork,
    };
  }

  const dynamic = standalone.get(conversationId);
  if (dynamic) {
    return {
      conversationId,
      agentId: dynamic.agentId,
      title: `New ${dynamic.agentId} chat`,
      messages: dynamic.messages,
      forkSession: null,
    };
  }

  const summary = mockAgentConversations.find((c) => c.conversationId === conversationId);
  if (!summary) return undefined;

  const transcript = mockConversations[summary.memoryScope];
  return {
    conversationId: summary.conversationId,
    agentId: summary.agentId,
    title: summary.title,
    messages: transcript?.messages ?? [],
    forkSession: null,
  };
}

export function getDefaultAgentConversationId(): string | undefined {
  return listAgentConversations()[0]?.conversationId;
}

function lastMessagePreview(messages: MockMessage[]): string {
  const last = [...messages].reverse().find((m) => m.role === "user" || m.role === "assistant");
  if (!last) return "No messages yet";
  const text = last.content.replace(/\s+/g, " ").trim();
  return text.length > 72 ? `${text.slice(0, 72)}…` : text;
}
