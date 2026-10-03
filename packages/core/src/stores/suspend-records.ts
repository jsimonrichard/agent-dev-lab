import type {
  EffectIntent,
  SuspendHandle,
  SuspendRecord,
  SuspendResolveDecision,
} from "../effect/types";
import { EVENT_SCHEMA_VERSION, type RunEvent } from "../observability/events";

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

export function workflowSuspendedEvent(args: {
  handle: SuspendHandle;
  intent: EffectIntent;
  runSeq: number;
  at?: string;
}): Extract<RunEvent, { type: "workflow_suspended" }> {
  return {
    type: "workflow_suspended",
    workflowRunId: args.handle.workflowRunId,
    handle: args.handle,
    intent: args.intent,
    runSeq: args.runSeq,
    at: args.at ?? nowIso(),
    eventSchemaVersion: EVENT_SCHEMA_VERSION,
  };
}

export function workflowResumedEvent(args: {
  workflowRunId: string;
  handleId: string;
  decision: SuspendResolveDecision;
  runSeq: number;
  at?: string;
}): Extract<RunEvent, { type: "workflow_resumed" }> {
  return {
    type: "workflow_resumed",
    workflowRunId: args.workflowRunId,
    handleId: args.handleId,
    decision: args.decision,
    runSeq: args.runSeq,
    at: args.at ?? nowIso(),
    eventSchemaVersion: EVENT_SCHEMA_VERSION,
  };
}
