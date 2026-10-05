import { AdlError } from "../errors";
import type { SuspendRecord, SuspendResolveDecision } from "../effect/types";

type Waiter = {
  promise: Promise<SuspendResolveDecision>;
  resolve: (decision: SuspendResolveDecision) => void;
  reject: (error: unknown) => void;
};

/**
 * Process-local waiters for {@link import("./workflow-store").WorkflowStore.waitForSuspendResolution}.
 * Per store instance — a new process (or a second store object on the same SQLite file)
 * does not inherit in-flight promises.
 */
export class SuspendWaiterHub {
  private readonly waiters = new Map<string, Waiter>();

  wait(handleId: string): Promise<SuspendResolveDecision> {
    const existing = this.waiters.get(handleId);
    if (existing) {
      return existing.promise;
    }
    let resolve!: (decision: SuspendResolveDecision) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<SuspendResolveDecision>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    this.waiters.set(handleId, { promise, resolve, reject });
    return promise;
  }

  settle(handleId: string, decision: SuspendResolveDecision): void {
    const waiter = this.waiters.get(handleId);
    if (!waiter) {
      return;
    }
    this.waiters.delete(handleId);
    waiter.resolve(decision);
  }

  fail(handleId: string, error: unknown): void {
    const waiter = this.waiters.get(handleId);
    if (!waiter) {
      return;
    }
    this.waiters.delete(handleId);
    waiter.reject(error);
  }

  failAll(handleIds: readonly string[], error: unknown): void {
    for (const handleId of handleIds) {
      this.fail(handleId, error);
    }
  }
}

export function missingSuspendError(handleId: string): AdlError {
  return new AdlError(
    "INVALID_INPUT",
    `Suspend handle "${handleId}" was not found. The pause is gone — the effect was not allowed.`,
  );
}

export function alreadyResolvedSuspendError(handleId: string): AdlError {
  return new AdlError(
    "INVALID_INPUT",
    `Suspend handle "${handleId}" is already resolved. A second resume is not allowed.`,
  );
}

export function pendingSuspendConflictError(workflowRunId: string): AdlError {
  return new AdlError(
    "INVALID_CONTEXT",
    `Run "${workflowRunId}" already has a pending suspend. Resolve or cancel it before parking again.`,
  );
}

export function unknownRunForSuspendError(workflowRunId: string): AdlError {
  return new AdlError("INVALID_INPUT", `Cannot suspend unknown workflow run "${workflowRunId}".`);
}

export function terminalRunSuspendError(workflowRunId: string, status: string): AdlError {
  return new AdlError(
    "INVALID_CONTEXT",
    `Cannot resolve a suspend on run "${workflowRunId}" with status "${status}".`,
  );
}

export async function waitForRecordResolution(
  hub: SuspendWaiterHub,
  handleId: string,
  load: () => Promise<SuspendRecord | null>,
): Promise<SuspendResolveDecision> {
  const record = await load();
  if (!record) {
    throw missingSuspendError(handleId);
  }
  if (record.status === "resolved") {
    if (!record.decision) {
      throw new AdlError(
        "INVALID_CONTEXT",
        `Suspend handle "${handleId}" is marked resolved but has no decision.`,
      );
    }
    return record.decision;
  }
  const waiting = hub.wait(handleId);
  const latest = await load();
  if (latest?.status === "resolved") {
    if (!latest.decision) {
      throw new AdlError(
        "INVALID_CONTEXT",
        `Suspend handle "${handleId}" is marked resolved but has no decision.`,
      );
    }
    hub.settle(handleId, latest.decision);
    return latest.decision;
  }
  if (!latest) {
    throw missingSuspendError(handleId);
  }
  return waiting;
}
