import type { CoreMessage, ToolSet } from "ai";

import type { Agent, AgentRunHandle, AgentRunInput, AgentRunResult } from "./types";

/** Default cap for {@link runAgentUntilIdle} so a stuck model cannot loop forever. */
export const DEFAULT_AGENT_IDLE_MAX_TURNS = 20;

/**
 * Count `tool-call` parts on assistant messages produced in one episode.
 * Used to decide whether another `agent.run()` is needed on the same memoryScope.
 */
export function countToolCallParts(messages: CoreMessage[]): number {
  let count = 0;
  for (const message of messages) {
    if (message.role !== "assistant" || !Array.isArray(message.content)) {
      continue;
    }
    for (const part of message.content) {
      if (
        typeof part === "object" &&
        part !== null &&
        "type" in part &&
        part.type === "tool-call"
      ) {
        count += 1;
      }
    }
  }
  return count;
}

export type RunAgentUntilIdleOptions<Tools extends ToolSet = ToolSet, TOutput = string> = {
  /** Maximum `agent.run()` episodes. Defaults to {@link DEFAULT_AGENT_IDLE_MAX_TURNS}. */
  maxTurns?: number;
  /** Called synchronously when each episode starts (before `result` resolves). */
  onHandle?: (handle: AgentRunHandle<Tools, TOutput>) => void;
};

/**
 * Re-run an agent on the same `memoryScope` until an episode emits no tool calls
 * (or `maxTurns` is hit). Each episode is still a single AI SDK step; this helper
 * is the TypeScript-owned loop that conversation UIs and simple ReAct-style callers
 * need. Workflows that want per-round `ctx.step` observability should keep an
 * explicit loop (see the playground `answer-question` workflow).
 *
 * The first episode uses `input.user` / `input.messages`. Later episodes load the
 * persisted transcript (including tool results) and pass neither.
 */
export async function runAgentUntilIdle<
  Context = unknown,
  Tools extends ToolSet = ToolSet,
  TOutput = string,
>(
  agent: Agent<Context, Tools, TOutput>,
  input: AgentRunInput<Context>,
  options?: RunAgentUntilIdleOptions<Tools, TOutput>,
): Promise<{ result: AgentRunResult<Tools, TOutput>; turns: number }> {
  const maxTurns = options?.maxTurns ?? DEFAULT_AGENT_IDLE_MAX_TURNS;
  if (maxTurns < 1) {
    throw new Error("runAgentUntilIdle: maxTurns must be at least 1");
  }

  let result: AgentRunResult<Tools, TOutput> | undefined;

  for (let turn = 0; turn < maxTurns; turn++) {
    const handle = agent.run({
      ...input,
      user: turn === 0 ? input.user : undefined,
      messages: turn === 0 ? input.messages : undefined,
    });
    options?.onHandle?.(handle);
    result = await handle.result;
    if (countToolCallParts(result.newMessages) === 0) {
      return { result, turns: turn + 1 };
    }
  }

  return { result: result as AgentRunResult<Tools, TOutput>, turns: maxTurns };
}
