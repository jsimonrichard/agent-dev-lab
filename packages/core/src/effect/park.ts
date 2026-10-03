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
  store: WorkflowStore;
  recorder?: Pick<RunRecorder, "adoptRunSeq">;
  signal?: AbortSignal;
};

async function adoptLatestSeq(
  store: WorkflowStore,
  workflowRunId: string,
  recorder: Pick<RunRecorder, "adoptRunSeq"> | undefined,
): Promise<void> {
  if (!recorder) {
    return;
  }
  const events = await store.listEvents({ workflowRunId });
  const maxSeq = events.reduce((max, event) => Math.max(max, event.runSeq), 0);
  if (maxSeq > 0) {
    recorder.adoptRunSeq(maxSeq);
  }
}

/**
 * Persist a suspend handle, park the run, and wait for {@link WorkflowStore.resolveSuspend}.
 */
export async function parkUntilResolved(args: {
  store: WorkflowStore;
  handle: SuspendHandle;
  intent: EffectIntent;
  recorder?: Pick<RunRecorder, "adoptRunSeq">;
  signal?: AbortSignal;
}): Promise<SuspendResolveDecision> {
  await args.store.createSuspend({ handle: args.handle, intent: args.intent });
  await adoptLatestSeq(args.store, args.handle.workflowRunId, args.recorder);
  const wait = args.store.waitForSuspendResolution(args.handle.id);
  const decision = args.signal ? await raceAbort(args.signal, wait) : await wait;
  await adoptLatestSeq(args.store, args.handle.workflowRunId, args.recorder);
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
