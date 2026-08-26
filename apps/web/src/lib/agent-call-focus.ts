/**
 * Serializable fields from `agent_messages_committed` used to locate a call's
 * slice of the stored transcript. `count` is model messages appended this
 * episode (excludes the user turn); `total` is transcript length after commit.
 */
export type AgentCallCommitFields = {
  type: string;
  total?: number;
  count?: number;
};

export type AgentCallMessageRange = {
  startIndex: number;
  endIndex: number;
};

/**
 * Inclusive index range of stored messages that belong to a specific agent call.
 * Prefers the first commit's `total - count` (then the preceding user turn when
 * present) so a later call on the same scope does not swallow an earlier turn.
 */
export function agentCallMessageRange(
  messages: ReadonlyArray<{ id: string; role?: string }>,
  events: ReadonlyArray<AgentCallCommitFields>,
  options?: { fallbackToLast?: boolean },
): AgentCallMessageRange | undefined {
  if (messages.length === 0) {
    return undefined;
  }

  const commits = events.filter((event) => event.type === "agent_messages_committed");
  const first = commits[0];
  const last = commits.at(-1);

  if (last && typeof last.total === "number" && last.total > 0) {
    const endIndex = Math.min(messages.length, last.total) - 1;
    if (endIndex < 0) {
      return undefined;
    }
    return clampRange(messages, startIndexForCommit(messages, first, endIndex), endIndex);
  }

  if (options?.fallbackToLast) {
    const endIndex = messages.length - 1;
    return clampRange(messages, previousUserIndex(messages, endIndex), endIndex);
  }

  return undefined;
}

export function messageIdsForAgentCall(
  messages: ReadonlyArray<{ id: string; role?: string }>,
  events: ReadonlyArray<AgentCallCommitFields>,
  options?: { fallbackToLast?: boolean },
): string[] {
  const range = agentCallMessageRange(messages, events, options);
  if (!range) {
    return [];
  }
  return messages.slice(range.startIndex, range.endIndex + 1).map((message) => message.id);
}

/**
 * Last stored transcript message produced by a specific agent call.
 * Uses `agent_messages_committed.total`, which is the conversation length after that call.
 */
export function lastMessageIdForAgentCall(
  messages: ReadonlyArray<{ id: string; role?: string }>,
  events: ReadonlyArray<AgentCallCommitFields>,
  options?: { fallbackToLast?: boolean },
): string | undefined {
  const range = agentCallMessageRange(messages, events, options);
  return range ? messages[range.endIndex]?.id : undefined;
}

function startIndexForCommit(
  messages: ReadonlyArray<{ role?: string }>,
  first: AgentCallCommitFields | undefined,
  endIndex: number,
): number {
  if (first && typeof first.total === "number" && typeof first.count === "number") {
    const modelStart = Math.max(0, first.total - first.count);
    if (modelStart > 0 && messages[modelStart - 1]?.role === "user") {
      return modelStart - 1;
    }
    return modelStart;
  }
  return previousUserIndex(messages, endIndex);
}

function previousUserIndex(messages: ReadonlyArray<{ role?: string }>, fromIndex: number): number {
  for (let index = fromIndex; index >= 0; index--) {
    if (messages[index]?.role === "user") {
      return index;
    }
  }
  return fromIndex;
}

function clampRange(
  messages: ReadonlyArray<{ role?: string }>,
  startIndex: number,
  endIndex: number,
): AgentCallMessageRange {
  let start = Math.max(0, startIndex);
  while (start <= endIndex && messages[start]?.role === "system") {
    start += 1;
  }
  if (start > endIndex) {
    start = endIndex;
  }
  return { startIndex: start, endIndex };
}
