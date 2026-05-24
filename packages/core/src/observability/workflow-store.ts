import type {
  AgentRunEventPayload,
  CustomEventPayload,
  RunCancelPayload,
  RunCompletePayload,
  RunErrorPayload,
  RunEvent,
  RunStartPayload,
  RunSummary,
  StepCompletePayload,
  StepErrorPayload,
  StepRecord,
  StepSlot,
  StepStartPayload,
} from "./events";

/**
 * Workflow run persistence: run/step I/O, events, and resume lookups.
 * @see notes/observability-api.md
 */
export interface WorkflowStore {
  recordRunStart(event: RunStartPayload & { input: unknown }): Promise<void>;
  recordRunComplete(event: RunCompletePayload): Promise<void>;
  recordRunCancel(event: RunCancelPayload): Promise<void>;
  recordRunError(event: RunErrorPayload): Promise<void>;

  recordStepStart(event: StepStartPayload): Promise<void>;
  recordStepComplete(
    event: StepCompletePayload & { output: unknown; input?: unknown },
  ): Promise<void>;
  recordStepError(event: StepErrorPayload): Promise<void>;

  recordCustomEvent(event: CustomEventPayload): Promise<void>;
  recordAgentEvent?(event: AgentRunEventPayload): Promise<void>;

  getRun(runId: string): Promise<RunSummary | null>;
  listRuns(filter?: { workflowId?: string; limit?: number }): Promise<RunSummary[]>;
  getRunInput(runId: string): Promise<unknown | null>;
  getRunOutput(runId: string): Promise<unknown | null>;
  getStepOutput(runId: string, slot: StepSlot): Promise<unknown | null>;
  getStepById(runId: string, stepId: string): Promise<StepRecord | null>;
  getRunEvents(runId: string, afterSeq?: number): Promise<RunEvent[]>;
}
