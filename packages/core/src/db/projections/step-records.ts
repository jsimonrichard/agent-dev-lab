import type { ModelMessage } from "ai";

import type { AdlDb } from "../index";
import { stepOutputs, stepRecords } from "../schema";

import type { MemoryScopeSnapshot, RunEvent, StepSlot } from "../../observability/events";

/**
 * Addressing rule for a step slot, and the encoding of the `slot_key` column.
 * Read back by `getStepOutput`, so a change here is a schema change.
 */
export function stepSlotKey(slot: StepSlot): string {
  return slot.path.join("\0");
}

export function encodeMemoryScopes(scopes: readonly string[] | undefined): string | null {
  return scopes && scopes.length > 0 ? JSON.stringify(scopes) : null;
}

export function decodeMemoryScopes(json: string | null): string[] | undefined {
  if (json === null) {
    return undefined;
  }
  const parsed: unknown = JSON.parse(json);
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
    throw new Error("adl_step_records.memory_scopes_json is not a string array");
  }
  return parsed;
}

export function encodeMemorySnapshots(
  snapshots: readonly MemoryScopeSnapshot[] | undefined,
): string | null {
  return snapshots && snapshots.length > 0 ? JSON.stringify(snapshots) : null;
}

export function decodeMemorySnapshots(json: string | null): MemoryScopeSnapshot[] | undefined {
  if (json === null) {
    return undefined;
  }
  const parsed: unknown = JSON.parse(json);
  if (!Array.isArray(parsed)) {
    throw new Error("adl_step_records.memory_snapshots_json is not an array");
  }
  return parsed.map((item) => {
    if (
      !item ||
      typeof item !== "object" ||
      !("scope" in item) ||
      !("messages" in item) ||
      typeof item.scope !== "string" ||
      !Array.isArray(item.messages)
    ) {
      throw new Error("adl_step_records.memory_snapshots_json entry is not a scope snapshot");
    }
    return { scope: item.scope, messages: item.messages as ModelMessage[] };
  });
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
    const memoryScopesJson = encodeMemoryScopes(event.memoryScopes);
    const memorySnapshotsJson = encodeMemorySnapshots(event.memorySnapshots);
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
        memoryScopesJson,
        memorySnapshotsJson,
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
          memoryScopesJson,
          memorySnapshotsJson,
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
    const memoryScopesJson = encodeMemoryScopes(event.memoryScopes);
    const memorySnapshotsJson = encodeMemorySnapshots(event.memorySnapshots);
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
        memoryScopesJson,
        memorySnapshotsJson,
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
          memoryScopesJson,
          memorySnapshotsJson,
        },
      })
      .run();
  }

  if (event.type === "step_failed") {
    const pathJson = JSON.stringify(event.path);
    const pure = event.pure === false ? 0 : 1;
    const memoryScopesJson = encodeMemoryScopes(event.memoryScopes);
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
        memoryScopesJson,
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
          memoryScopesJson,
        },
      })
      .run();
  }
}
