import { eq } from "drizzle-orm";

import type { AdlDb } from "../index";
import { workflowRuns, workflowRunTags } from "../schema";

import type { RunEvent } from "../../observability/events";

/**
 * Projects workflow lifecycle events into `adl_workflow_runs` and its tag table.
 *
 * Read model only: `adl_run_events` remains the source of truth, so every
 * write here must be reproducible by replaying the log through
 * {@link applyProjections}.
 */
export function projectWorkflowRun(db: AdlDb, event: RunEvent): void {
  if (event.type === "workflow_started") {
    const inputJson = JSON.stringify(event.input);
    db.insert(workflowRuns)
      .values({
        workflowRunId: event.workflowRunId,
        workflowId: event.workflowId,
        status: "running",
        startedAt: event.at,
        finishedAt: null,
        inputJson,
        outputJson: null,
      })
      .onConflictDoUpdate({
        target: workflowRuns.workflowRunId,
        set: {
          workflowId: event.workflowId,
          status: "running",
          startedAt: event.at,
          finishedAt: null,
          inputJson,
          outputJson: null,
        },
      })
      .run();

    for (const tag of event.tags ?? []) {
      db.insert(workflowRunTags)
        .values({ workflowRunId: event.workflowRunId, tag })
        .onConflictDoNothing()
        .run();
    }
  }

  if (event.type === "workflow_finished") {
    db.update(workflowRuns)
      .set({ status: "ok", finishedAt: event.at, outputJson: JSON.stringify(event.output) })
      .where(eq(workflowRuns.workflowRunId, event.workflowRunId))
      .run();
  }

  if (event.type === "workflow_failed") {
    db.update(workflowRuns)
      .set({ status: "error", finishedAt: event.at })
      .where(eq(workflowRuns.workflowRunId, event.workflowRunId))
      .run();
  }

  if (event.type === "workflow_cancelled") {
    db.update(workflowRuns)
      .set({ status: "cancelled", finishedAt: event.at })
      .where(eq(workflowRuns.workflowRunId, event.workflowRunId))
      .run();
  }

  if (event.type === "workflow_title_set") {
    db.insert(workflowRuns)
      .values({
        workflowRunId: event.workflowRunId,
        workflowId: "",
        status: "running",
        startedAt: event.at,
        title: event.title,
      })
      .onConflictDoUpdate({
        target: workflowRuns.workflowRunId,
        set: { title: event.title },
      })
      .run();
  }
}
