import type { LoggedRunEvent, RunEvent as CoreRunEvent } from "@agent-dev-lab/core";

export function encodeRunEventSse(event: CoreRunEvent): string {
  const lines = [`id: ${event.runSeq}`, `data: ${JSON.stringify(event)}`, "", ""];
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

/**
 * Close the run SSE only after a terminal event was delivered, or when the store
 * already shows a settled run and this poll drained all remaining events.
 *
 * Closing on `status !== "running"` alone races cancel: `step_failed` /
 * `agent_failed` can land before `workflow_cancelled` while status is already
 * `cancelled`, which would drop the terminal event and leave the live UI stuck.
 */
export function shouldCloseWorkflowRunStream(options: {
  sawTerminalEvent: boolean;
  eventBatchEmpty: boolean;
  runStatus: string | undefined;
}): boolean {
  if (options.sawTerminalEvent) {
    return true;
  }
  return (
    options.eventBatchEmpty && options.runStatus !== undefined && options.runStatus !== "running"
  );
}

/** Standalone agent turn settled. */
export function agentRunStreamIsTerminal(event: CoreRunEvent): boolean {
  return event.type === "agent_finished" || event.type === "agent_failed";
}

/**
 * Close conversation SSE after the current turn has settled and the inspector
 * is not about to start another `agent.run()` on this scope.
 */
export function shouldCloseAgentConversationStream(options: {
  sawTerminalEvent: boolean;
  conversationTurnActive: boolean;
}): boolean {
  return options.sawTerminalEvent && !options.conversationTurnActive;
}
