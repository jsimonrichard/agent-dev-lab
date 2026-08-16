import type { RunEvent as CoreRunEvent } from "@agent-dev-lab/core";

export function encodeRunEventSse(event: CoreRunEvent): string {
  const lines = [`id: ${event.seq}`, `data: ${JSON.stringify(event)}`, "", ""];
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

/** Standalone agent conversation SSE ends when that episode settles. */
export function agentRunStreamIsTerminal(event: CoreRunEvent): boolean {
  return event.type === "agent_finished" || event.type === "agent_failed";
}
