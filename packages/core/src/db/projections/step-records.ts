import type { AdlDb } from "../index";
import { stepOutputs, stepRecords } from "../schema";

import type { RunEvent, StepSlot } from "../../observability/events";

/**
 * Addressing rule for a step slot, and the encoding of the `slot_key` column.
 * Read back by `getStepOutput`, so a change here is a schema change.
 */
export function stepSlotKey(slot: StepSlot): string {
  return slot.path.join("\0");
}

/**
 * Projects step terminal events into `adl_step_outputs` and `adl_step_records`.
 * Read model only — see {@link projectWorkflowRun}.
 */
export function projectStepRecord(db: AdlDb, event: RunEvent): void {
  if (event.type === "step_finished") {
    const slot = stepSlotKey({ path: event.path });
    const outputJson = JSON.stringify(event.output);
    const pure = event.pure === false ? 0 : 1;
    db.insert(stepOutputs)
      .values({ workflowRunId: event.workflowRunId, slotKey: slot, outputJson })
      .onConflictDoUpdate({
        target: [stepOutputs.workflowRunId, stepOutputs.slotKey],
        set: { outputJson },
      })
      .run();

    const pathJson = JSON.stringify(event.path);
    db.insert(stepRecords)
      .values({
        workflowRunId: event.workflowRunId,
        stepId: event.stepId,
        name: event.name,
        key: event.key ?? null,
        pathJson,
        parentStepId: event.parentStepId,
        outputJson,
        status: "ok",
        pure,
        replayOfStepId: event.replayOfStepId ?? null,
      })
      .onConflictDoUpdate({
        target: [stepRecords.workflowRunId, stepRecords.stepId],
        set: {
          name: event.name,
          key: event.key ?? null,
          pathJson,
          parentStepId: event.parentStepId,
          outputJson,
          status: "ok",
          pure,
          replayOfStepId: event.replayOfStepId ?? null,
        },
      })
      .run();
  }

  if (event.type === "step_skipped") {
    const slot = stepSlotKey({ path: event.path });
    const outputJson = JSON.stringify(event.output);
    db.insert(stepOutputs)
      .values({ workflowRunId: event.workflowRunId, slotKey: slot, outputJson })
      .onConflictDoUpdate({
        target: [stepOutputs.workflowRunId, stepOutputs.slotKey],
        set: { outputJson },
      })
      .run();

    const pathJson = JSON.stringify(event.path);
    db.insert(stepRecords)
      .values({
        workflowRunId: event.workflowRunId,
        stepId: event.stepId,
        name: event.name,
        key: event.key ?? null,
        pathJson,
        parentStepId: event.parentStepId,
        outputJson,
        status: "ok",
        pure: 1,
        replayOfStepId: event.replayOfStepId ?? null,
      })
      .onConflictDoUpdate({
        target: [stepRecords.workflowRunId, stepRecords.stepId],
        set: {
          name: event.name,
          key: event.key ?? null,
          pathJson,
          parentStepId: event.parentStepId,
          outputJson,
          status: "ok",
          replayOfStepId: event.replayOfStepId ?? null,
        },
      })
      .run();
  }

  if (event.type === "step_failed") {
    const pathJson = JSON.stringify(event.path);
    const pure = event.pure === false ? 0 : 1;
    db.insert(stepRecords)
      .values({
        workflowRunId: event.workflowRunId,
        stepId: event.stepId,
        name: event.name,
        key: event.key ?? null,
        pathJson,
        parentStepId: event.parentStepId,
        outputJson: null,
        status: "error",
        pure,
        replayOfStepId: event.replayOfStepId ?? null,
      })
      .onConflictDoUpdate({
        target: [stepRecords.workflowRunId, stepRecords.stepId],
        set: {
          name: event.name,
          key: event.key ?? null,
          pathJson,
          parentStepId: event.parentStepId,
          outputJson: null,
          status: "error",
          pure,
          replayOfStepId: event.replayOfStepId ?? null,
        },
      })
      .run();
  }
}
