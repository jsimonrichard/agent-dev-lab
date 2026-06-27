import type { RunEvent as CoreRunEvent } from "@agent-dev-lab/core";

export function encodeRunEventSse(event: CoreRunEvent): string {
  const lines = [`id: ${event.seq}`, `data: ${JSON.stringify(event)}`, "", ""];
  return lines.join("\n");
}

export function runEventStreamIsTerminal(event: CoreRunEvent): boolean {
  return (
    event.type === "workflow_finished" ||
    event.type === "workflow_failed" ||
    event.type === "workflow_cancelled" ||
    event.type === "agent_finished" ||
    event.type === "agent_failed"
  );
}
