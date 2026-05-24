import type { RunEvent, StepRecord, StepSlot, WorkflowRunSummary } from "./events";

/**
 * Workflow run persistence: run/step I/O, events, and resume lookups.
 *
 * Writes use {@link recordEvent} with the same discriminated union as observers / SSE.
 *
 * @see notes/observability-api.md
 */
export interface WorkflowStore {
  /** Persist one append-only run event (and derived I/O when applicable). */
  recordEvent(event: RunEvent): Promise<void>;

  getRun(workflowRunId: string): Promise<WorkflowRunSummary | null>;
  listRuns(filter?: { workflowId?: string; limit?: number }): Promise<WorkflowRunSummary[]>;
  getRunInput(workflowRunId: string): Promise<unknown | null>;
  getRunOutput(workflowRunId: string): Promise<unknown | null>;
  getStepOutput(workflowRunId: string, slot: StepSlot): Promise<unknown | null>;
  getStepById(workflowRunId: string, stepId: string): Promise<StepRecord | null>;
  getRunEvents(workflowRunId: string, afterSeq?: number): Promise<RunEvent[]>;
}
