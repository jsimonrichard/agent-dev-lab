import type { WorkflowRunSummary } from "@agent-dev-lab/core";

/**
 * If any run in the attempt forest is still live, return its id.
 * Retry must not seed a new attempt until the prior forest has settled.
 */
export function findRunningForestRunId(
  root: Pick<WorkflowRunSummary, "workflowRunId" | "status">,
  descendants: ReadonlyArray<Pick<WorkflowRunSummary, "workflowRunId" | "status">>,
): string | null {
  if (root.status === "running") {
    return root.workflowRunId;
  }
  for (const run of descendants) {
    if (run.status === "running") {
      return run.workflowRunId;
    }
  }
  return null;
}
