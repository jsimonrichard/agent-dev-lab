import type { LoggedRunEvent, RunEvent as CoreRunEvent } from "@agent-dev-lab/core";

export function encodeRunEventSse(event: CoreRunEvent): string {
  const lines = [`id: ${event.seq}`, `data: ${JSON.stringify(event)}`, "", ""];
  return lines.join("\n");
}

export function encodeLoggedRunEventSse(entry: LoggedRunEvent): string {
  const lines = [`id: ${entry.logSeq}`, `data: ${JSON.stringify(entry)}`, "", ""];
  return lines.join("\n");
}

/** Workflow SSE must stay open across in-step agent episodes (parallel or sequential). */
export function workflowRunStreamIsTerminal(event: CoreRunEvent): boolean {
  return (
    event.type === "workflow_finished" ||
    event.type === "workflow_failed" ||
    event.type === "workflow_cancelled"
  );
}

/** Standalone agent episode settled — not the end of a multi-episode tool loop. */
export function agentRunStreamIsTerminal(event: CoreRunEvent): boolean {
  return event.type === "agent_finished" || event.type === "agent_failed";
}

/**
 * Close conversation SSE after the current episode has settled and the inspector
 * is not about to start another `agent.run()` on this scope (tool-loop continuation).
 */
export function shouldCloseAgentConversationStream(options: {
  sawTerminalEvent: boolean;
  conversationTurnActive: boolean;
}): boolean {
  return options.sawTerminalEvent && !options.conversationTurnActive;
}
