import type { RunEvent, StepSlot } from "../../observability/events";
import type { AdlSqliteDatabase } from "../sqlite-types";

/**
 * Addressing rule for a step slot, and the encoding of the `slot_key` column.
 * Read back by `getStepOutput`, so a change here is a schema change.
 */
export function stepSlotKey(slot: StepSlot): string {
  const keyPart = slot.key ?? "";
  return `${slot.parentStepId ?? "root"}:${slot.name}:${keyPart}`;
}

/**
 * Projects step terminal events into `adl_step_outputs` and `adl_step_records`.
 * Read model only — see {@link projectWorkflowRun}.
 */
export function projectStepRecord(sqlite: AdlSqliteDatabase, event: RunEvent): void {
  if (event.type === "step_finished") {
    const slot = stepSlotKey({
      parentStepId: event.parentStepId,
      name: event.name,
      key: event.key,
    });
    sqlite
      .prepare(
        `INSERT OR REPLACE INTO adl_step_outputs (workflow_run_id, slot_key, output_json) VALUES (?, ?, ?)`,
      )
      .run(event.workflowRunId, slot, JSON.stringify(event.output));
    sqlite
      .prepare(
        `INSERT OR REPLACE INTO adl_step_records
          (workflow_run_id, step_id, name, key, path_json, parent_step_id, output_json, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'ok')`,
      )
      .run(
        event.workflowRunId,
        event.stepId,
        event.name,
        event.key ?? null,
        JSON.stringify(event.path),
        event.parentStepId,
        JSON.stringify(event.output),
      );
  }

  if (event.type === "step_failed") {
    sqlite
      .prepare(
        `INSERT OR REPLACE INTO adl_step_records
          (workflow_run_id, step_id, name, key, path_json, parent_step_id, output_json, status)
         VALUES (?, ?, ?, ?, ?, ?, NULL, 'error')`,
      )
      .run(
        event.workflowRunId,
        event.stepId,
        event.name,
        event.key ?? null,
        JSON.stringify(event.path),
        event.parentStepId,
      );
  }
}
