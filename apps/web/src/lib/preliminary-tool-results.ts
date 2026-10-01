import type { RunEvent as CoreRunEvent } from "@agent-dev-lab/core";

/**
 * Fold an SSE `agent_tool_result` into a toolCallId → latest preliminary payload map.
 * Final (`!preliminary`) results clear the entry so the MessageStore card takes over.
 * Returns the same Map reference when the event is unrelated.
 */
export function foldPreliminaryToolResult(
  prev: Map<string, unknown>,
  event: CoreRunEvent,
): Map<string, unknown> {
  if (event.type !== "agent_tool_result") {
    return prev;
  }
  if (event.preliminary === true) {
    const next = new Map(prev);
    next.set(event.toolCallId, event.result);
    return next;
  }
  if (!prev.has(event.toolCallId)) {
    return prev;
  }
  const next = new Map(prev);
  next.delete(event.toolCallId);
  return next;
}
