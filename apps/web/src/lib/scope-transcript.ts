import type { AgentEpisode, MockMessage, RunEvent } from "@/lib/mock/types";

export type ScopeTranscriptPartition = {
  prior: MockMessage[];
  current: MockMessage[];
  later: MockMessage[];
};

/**
 * Split a shared memoryScope transcript into the selected agent call, earlier
 * context that call saw, and later turns from subsequent calls on the same scope.
 */
export function partitionScopeTranscript(
  messages: MockMessage[],
  events: RunEvent[],
  episode: Pick<AgentEpisode, "episodeId" | "memoryScope">,
): ScopeTranscriptPartition {
  return (
    partitionByCommitTotals(messages, events, episode) ??
    partitionByTurns(messages, events, episode)
  );
}

function partitionByCommitTotals(
  messages: MockMessage[],
  events: RunEvent[],
  episode: Pick<AgentEpisode, "episodeId" | "memoryScope">,
): ScopeTranscriptPartition | null {
  const starts = events.filter(
    (event): event is Extract<RunEvent, { type: "agent_started" }> =>
      event.type === "agent_started" && event.memoryScope === episode.memoryScope,
  );
  const commits = events.filter(
    (event): event is Extract<RunEvent, { type: "messages_committed" }> =>
      event.type === "messages_committed" && event.memoryScope === episode.memoryScope,
  );
  if (commits.length === 0 || commits.some((commit) => commit.total === undefined)) {
    return null;
  }

  const index = starts.findIndex((event) => event.episodeId === episode.episodeId);
  if (index < 0) {
    return null;
  }

  const totalByEpisode = new Map(
    commits.map((commit) => [commit.episodeId, commit.total as number]),
  );

  let priorEnd = 0;
  for (let i = 0; i < index; i++) {
    const previousId = starts[i]?.episodeId;
    if (!previousId) {
      return null;
    }
    const previousTotal = totalByEpisode.get(previousId);
    if (previousTotal === undefined) {
      return null;
    }
    priorEnd = previousTotal;
  }

  const thisTotal = totalByEpisode.get(episode.episodeId);
  if (thisTotal === undefined) {
    return {
      prior: messages.slice(0, priorEnd),
      current: messages.slice(priorEnd),
      later: [],
    };
  }

  return {
    prior: messages.slice(0, priorEnd),
    current: messages.slice(priorEnd, thisTotal),
    later: messages.slice(thisTotal),
  };
}

function partitionByTurns(
  messages: MockMessage[],
  events: RunEvent[],
  episode: Pick<AgentEpisode, "episodeId" | "memoryScope">,
): ScopeTranscriptPartition {
  const turns = splitTranscriptTurns(messages);
  const episodeIndex = episodeIndexInScope(events, episode);

  if (turns.length === 0) {
    return { prior: [], current: [], later: [] };
  }

  if (episodeIndex >= turns.length) {
    return { prior: messages, current: [], later: [] };
  }

  return {
    prior: turns.slice(0, episodeIndex).flat(),
    current: turns[episodeIndex] ?? [],
    later: turns.slice(episodeIndex + 1).flat(),
  };
}

/** One agent call is typically a user message plus the assistant/tool follow-through. */
export function splitTranscriptTurns(messages: MockMessage[]): MockMessage[][] {
  const turns: MockMessage[][] = [];
  let current: MockMessage[] = [];
  for (const message of messages) {
    if (message.role === "user" && current.length > 0) {
      turns.push(current);
      current = [message];
    } else {
      current.push(message);
    }
  }
  if (current.length > 0) {
    turns.push(current);
  }
  return turns;
}

export function episodeIndexInScope(
  events: RunEvent[],
  episode: Pick<AgentEpisode, "episodeId" | "memoryScope">,
): number {
  let index = 0;
  for (const event of events) {
    if (event.type !== "agent_started" || event.memoryScope !== episode.memoryScope) {
      continue;
    }
    if (event.episodeId === episode.episodeId) {
      return index;
    }
    index += 1;
  }
  return 0;
}
