import type { RunEvent as CoreRunEvent } from "@agent-dev-lab/core";

import type { RunEvent as UiRunEvent, RunStatus } from "#/lib/mock/types";

/** Maps core {@link RunEvent} records to the UI reducer shape in `run-projection.ts`. */
export function adaptCoreEventsForWorkflowRun(
  workflowRunId: string,
  events: CoreRunEvent[],
): UiRunEvent[] {
  const out: UiRunEvent[] = [];

  for (const event of events) {
    if ("workflowRunId" in event && event.workflowRunId && event.workflowRunId !== workflowRunId) {
      continue;
    }

    switch (event.type) {
      case "workflow_started":
        out.push({
          seq: event.seq,
          runId: event.workflowRunId,
          type: "run_started",
          at: event.at,
          workflowId: event.workflowId,
          input: event.input,
        });
        break;
      case "workflow_finished":
        out.push({
          seq: event.seq,
          runId: event.workflowRunId,
          type: "run_finished",
          at: event.at,
          output: event.output,
        });
        break;
      case "workflow_failed":
        out.push({
          seq: event.seq,
          runId: event.workflowRunId,
          type: "run_failed",
          at: event.at,
        });
        break;
      case "workflow_cancelled":
        out.push({
          seq: event.seq,
          runId: event.workflowRunId,
          type: "run_failed",
          at: event.at,
        });
        break;
      case "step_started":
        if (!event.workflowRunId) break;
        out.push({
          seq: event.seq,
          runId: event.workflowRunId,
          type: "step_started",
          at: event.at,
          stepId: event.stepId,
          parentStepId: event.parentStepId,
          name: event.name,
          key: event.key,
          path: event.path,
        });
        break;
      case "step_finished":
        if (!event.workflowRunId) break;
        out.push({
          seq: event.seq,
          runId: event.workflowRunId,
          type: "step_finished",
          at: event.at,
          stepId: event.stepId,
          durationMs: event.durationMs,
          output: event.output,
        });
        break;
      case "step_failed":
        if (!event.workflowRunId) break;
        out.push({
          seq: event.seq,
          runId: event.workflowRunId,
          type: "step_failed",
          at: event.at,
          stepId: event.stepId,
        });
        break;
      case "agent_started":
        if (!event.workflowRunId || !event.stepId) break;
        out.push({
          seq: event.seq,
          runId: event.workflowRunId,
          type: "agent_started",
          at: event.at,
          stepId: event.stepId,
          agentId: event.agentId,
          memoryScope: event.memoryScope,
          episodeId: event.agentCallId,
        });
        break;
      case "agent_finished":
        if (!event.workflowRunId || !event.stepId) break;
        out.push({
          seq: event.seq,
          runId: event.workflowRunId,
          type: "agent_finished",
          at: event.at,
          stepId: event.stepId,
          episodeId: event.agentCallId,
          durationMs: 0,
        });
        break;
      case "agent_text_delta":
        if (!event.workflowRunId || !event.stepId) break;
        out.push({
          seq: event.seq,
          runId: event.workflowRunId,
          type: "text_delta",
          at: event.at,
          stepId: event.stepId,
          episodeId: event.agentCallId,
          delta: event.delta,
        });
        break;
      case "agent_messages_committed":
        if (!event.workflowRunId || !event.stepId) break;
        out.push({
          seq: event.seq,
          runId: event.workflowRunId,
          type: "messages_committed",
          at: event.at,
          stepId: event.stepId,
          memoryScope: event.memoryScope,
          messageCount: event.count,
        });
        break;
      case "agent_tool_call":
      case "agent_tool_result":
      case "agent_failed":
      case "step_skipped":
      case "custom":
        break;
    }
  }

  return out;
}

export function mapWorkflowRunStatus(status: "running" | "ok" | "error" | "cancelled"): RunStatus {
  switch (status) {
    case "ok":
      return "completed";
    case "error":
      return "failed";
    case "cancelled":
      return "cancelled";
    default:
      return "running";
  }
}

export function formatInputPreview(input: unknown): string {
  if (input === null || input === undefined) {
    return "{}";
  }
  try {
    const text = JSON.stringify(input);
    return text.length > 120 ? `${text.slice(0, 117)}…` : text;
  } catch {
    return String(input);
  }
}
