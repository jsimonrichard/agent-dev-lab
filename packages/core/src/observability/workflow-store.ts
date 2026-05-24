import type {
  RunEvent,
  RunEventOfType,
  RunEventType,
  StepRecord,
  StepSlot,
  WorkflowRunSummary,
} from "./events";

/**
 * Filter for {@link WorkflowStore.listEvents}.
 *
 * Prefer this over many per-type getters: one append log, many views.
 */
export type ListEventsFilter = {
  /** Single type or subset (omit = all types). */
  type?: RunEventType | RunEventType[];
  /** Return events with `seq` greater than this value (SSE tail). */
  afterSeq?: number;
  limit?: number;
};

/**
 * Workflow run persistence: materialized I/O + append-only events.
 *
 * ## Read API shape
 *
 * **Event log (replay / SSE):** use {@link listEvents} with an optional `type` filter.
 * That covers “all `step_started` for this run”, “tail after seq N”, etc. without
 * `getEvent(type)` per variant (which is ambiguous when many events share a type).
 *
 * **Latest of one type:** {@link getLatestEvent} for status polls (`workflow_finished`).
 *
 * **Resume / skip (not the event log):** keep dedicated getters (`getStepOutput`,
 * `getRunInput`, …). Those read normalized tables the store maintains when
 * {@link recordEvent} runs — faster than scanning the log on every `ctx.step`.
 *
 * A matrix of `getWorkflowStartedEvent()`, `getStepStartedEvent()`, … would mirror
 * `listEvents({ type })` fifteen times and still wouldn’t replace `getStepOutput`.
 *
 * @see notes/observability-api.md
 */
export interface WorkflowStore {
  recordEvent(event: RunEvent): Promise<void>;

  /**
   * Read events for a workflow invocation (optionally filtered by `type`).
   * Primary API for UI replay and SSE backfill.
   */
  listEvents(workflowRunId: string, filter?: ListEventsFilter): Promise<RunEvent[]>;

  /**
   * Most recent event of a given type for this run, if any.
   * Useful for “is it finished yet?” without loading the full log.
   */
  getLatestEvent<T extends RunEventType>(
    workflowRunId: string,
    type: T,
  ): Promise<RunEventOfType<T> | null>;

  /** @deprecated Use {@link listEvents}. */
  getRunEvents?(workflowRunId: string, afterSeq?: number): Promise<RunEvent[]>;

  getRun(workflowRunId: string): Promise<WorkflowRunSummary | null>;
  listRuns(filter?: { workflowId?: string; limit?: number }): Promise<WorkflowRunSummary[]>;
  getRunInput(workflowRunId: string): Promise<unknown | null>;
  getRunOutput(workflowRunId: string): Promise<unknown | null>;
  getStepOutput(workflowRunId: string, slot: StepSlot): Promise<unknown | null>;
  getStepById(workflowRunId: string, stepId: string): Promise<StepRecord | null>;
}
