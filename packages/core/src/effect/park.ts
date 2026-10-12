import { AdlError } from "../errors";
import { createId } from "../internal/ids";
import { raceAbort } from "../internal/abort";
import type { RunRecorder } from "../runtime/run-recorder";
import type { WorkflowStore } from "../stores/workflow-store";
import type {
  EffectDecision,
  EffectGate,
  EffectIntent,
  SuspendHandle,
  SuspendReason,
  SuspendResolveDecision,
} from "./types";

export type ParkOnSuspend = {
  /** Where suspends persist. Without one, a `suspend` decision throws instead of parking. */
  store: WorkflowStore | undefined;
  /**
   * The parked run's recorder. `workflow_suspended` / `workflow_resumed` go through it so the
   * run keeps a single `runSeq` allocator. Without one (no active run), suspend throws.
   */
  recorder: Pick<RunRecorder, "emit"> | undefined;
  signal?: AbortSignal;
};

/**
 * Persist a suspend handle, park the run, and wait for {@link WorkflowStore.resolveSuspend}.
 */
export async function parkUntilResolved(args: {
  store: WorkflowStore;
  handle: SuspendHandle;
  intent: EffectIntent;
  recorder: Pick<RunRecorder, "emit">;
  signal?: AbortSignal;
}): Promise<SuspendResolveDecision> {
  await args.store.createSuspend({ handle: args.handle, intent: args.intent });
  await args.recorder.emit({
    type: "workflow_suspended",
    workflowRunId: args.handle.workflowRunId,
    handle: args.handle,
    intent: args.intent,
  });
  const wait = args.store.waitForSuspendResolution(args.handle.id);
  const decision = args.signal ? await raceAbort(args.signal, wait) : await wait;
  await args.recorder.emit({
    type: "workflow_resumed",
    workflowRunId: args.handle.workflowRunId,
    handleId: args.handle.id,
    decision,
  });
  return decision;
}

/**
 * Wrap a gate so `suspend` persists and blocks until resume. Allow/deny/rewrite pass through.
 * Hosts that want interactive approval should return suspend from an inner handler, then
 * call {@link WorkflowStore.resolveSuspend} from the UI.
 */
export function parkingEffectGate(inner: EffectGate, park: ParkOnSuspend): EffectGate {
  return {
    async handle(intent: EffectIntent): Promise<EffectDecision> {
      const decision = await inner.handle(intent);
      if (decision.action !== "suspend") {
        return decision;
      }
      if (decision.handle.workflowRunId !== intent.workflowRunId) {
        throw new AdlError(
          "INVALID_CONTEXT",
          `Suspend handle run "${decision.handle.workflowRunId}" does not match intent run "${intent.workflowRunId}".`,
        );
      }
      if (!park.store) {
        throw new AdlError(
          "INVALID_CONTEXT",
          `Cannot park intent "${intent.id}" on run "${intent.workflowRunId}": no workflow store is configured.`,
        );
      }
      if (!park.recorder) {
        throw new AdlError(
          "INVALID_CONTEXT",
          `Cannot park intent "${intent.id}": suspends need an active workflow run (a standalone agent.run cannot park).`,
        );
      }
      return parkUntilResolved({
        store: park.store,
        handle: decision.handle,
        intent,
        recorder: park.recorder,
        signal: park.signal,
      });
    },
  };
}

export function createSuspendHandle(args: {
  intent: EffectIntent;
  reason: SuspendReason;
}): SuspendHandle {
  return {
    id: createId(),
    intentId: args.intent.id,
    workflowRunId: args.intent.workflowRunId,
    reason: args.reason,
    createdAt: new Date().toISOString(),
  };
}
