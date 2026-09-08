import type { RunEvent } from "../../observability/events";
import type { AdlSqliteDatabase } from "../sqlite-types";

/**
 * Projects workflow lifecycle events into `adl_workflow_runs` and its tag table.
 *
 * Read model only: `adl_workflow_events` remains the source of truth, so every
 * write here must be reproducible by replaying the log through
 * {@link applyProjections}.
 */
export function projectWorkflowRun(sqlite: AdlSqliteDatabase, event: RunEvent): void {
  if (event.type === "workflow_started") {
    sqlite
      .prepare(
        `INSERT INTO adl_workflow_runs
          (workflow_run_id, workflow_id, status, started_at, finished_at, input_json, output_json)
         VALUES (?, ?, 'running', ?, NULL, ?, NULL)
         ON CONFLICT(workflow_run_id) DO UPDATE SET
           workflow_id = excluded.workflow_id,
           status = 'running',
           started_at = excluded.started_at,
           finished_at = NULL,
           input_json = excluded.input_json,
           output_json = NULL`,
      )
      .run(event.workflowRunId, event.workflowId, event.at, JSON.stringify(event.input));

    for (const tag of event.tags ?? []) {
      sqlite
        .prepare(`INSERT OR IGNORE INTO adl_workflow_run_tags (workflow_run_id, tag) VALUES (?, ?)`)
        .run(event.workflowRunId, tag);
    }
  }

  if (event.type === "workflow_finished") {
    sqlite
      .prepare(
        `UPDATE adl_workflow_runs SET status = 'ok', finished_at = ?, output_json = ? WHERE workflow_run_id = ?`,
      )
      .run(event.at, JSON.stringify(event.output), event.workflowRunId);
  }

  if (event.type === "workflow_failed") {
    sqlite
      .prepare(
        `UPDATE adl_workflow_runs SET status = 'error', finished_at = ? WHERE workflow_run_id = ?`,
      )
      .run(event.at, event.workflowRunId);
  }

  if (event.type === "workflow_cancelled") {
    sqlite
      .prepare(
        `UPDATE adl_workflow_runs SET status = 'cancelled', finished_at = ? WHERE workflow_run_id = ?`,
      )
      .run(event.at, event.workflowRunId);
  }

  if (event.type === "workflow_title_set") {
    sqlite
      .prepare(
        `INSERT INTO adl_workflow_runs (workflow_run_id, workflow_id, status, started_at, title)
         VALUES (?, '', 'running', ?, ?)
         ON CONFLICT(workflow_run_id) DO UPDATE SET title = excluded.title`,
      )
      .run(event.workflowRunId, event.at, event.title);
  }
}
