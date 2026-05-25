import type { ForkedAgentSession, MockMessage } from "./types";

const forks = new Map<string, ForkedAgentSession>();

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

export function getForkedSession(forkId: string): ForkedAgentSession | undefined {
  return forks.get(forkId);
}

export function appendForkMessage(
  forkId: string,
  message: MockMessage,
): ForkedAgentSession | undefined {
  const session = forks.get(forkId);
  if (!session) return undefined;
  session.messages.push(message);
  return session;
}
