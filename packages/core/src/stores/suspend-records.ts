import type {
  EffectIntent,
  SuspendHandle,
  SuspendRecord,
  SuspendResolveDecision,
} from "../effect/types";
import { AdlError } from "../errors";

/**
 * Trust boundary for {@link import("./workflow-store").WorkflowStore.resolveSuspend}: decisions
 * arrive from UIs and HTTP bodies, and an unrecognized action must never read as approval.
 */
export function assertSuspendResolveDecision(
  value: unknown,
): asserts value is SuspendResolveDecision {
  if (typeof value !== "object" || value === null || !("action" in value)) {
    throw new AdlError("INVALID_INPUT", "Suspend decision must be an object with an action.");
  }
  switch (value.action) {
    case "allow":
      return;
    case "deny":
      if (!("reason" in value) || typeof value.reason !== "string" || !value.reason.trim()) {
        throw new AdlError("INVALID_INPUT", "A deny decision requires a non-empty reason.");
      }
      return;
    case "rewrite":
      if (!("payload" in value)) {
        throw new AdlError("INVALID_INPUT", "A rewrite decision requires a payload.");
      }
      return;
    default:
      throw new AdlError(
        "INVALID_INPUT",
        `Suspend decision action must be allow, deny, or rewrite; got ${JSON.stringify(value.action)}.`,
      );
  }
}

export function nextRunSeq(events: readonly { runSeq: number }[]): number {
  return events.reduce((max, event) => Math.max(max, event.runSeq), 0) + 1;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function toSuspendRecord(args: {
  handle: SuspendHandle;
  intent: EffectIntent;
  status: SuspendRecord["status"];
  decision?: SuspendResolveDecision;
  resolvedAt?: string;
}): SuspendRecord {
  return {
    handle: args.handle,
    intent: args.intent,
    status: args.status,
    ...(args.decision ? { decision: args.decision } : {}),
    ...(args.resolvedAt ? { resolvedAt: args.resolvedAt } : {}),
  };
}
