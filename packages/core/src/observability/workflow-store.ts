import type {
  RunEvent,
  RunEventOfType,
  RunEventType,
  StepRecord,
  StepSlot,
  WorkflowRunSummary,
} from "./events";

/** One `agent_started` episode, used to rebuild inspector chats after restart. */
export type AgentEpisodeSummary = {
  agentCallId: string;
  agentId: string;
  memoryScope: string;
  startedAt: string;
  workflowRunId?: string;
  stepId?: string | null;
};

/**
 * Scope for reading events — workflow log vs standalone agent episode.
 */
export type ListEventsScope = { workflowRunId: string } | { agentCallId: string };

export type ListEventsFilter = {
  type?: RunEventType | RunEventType[];
  afterSeq?: number;
  limit?: number;
};

/**
 * Workflow run persistence: materialized run/step I/O plus append-only {@link RunEvent}s.
 *
 * **Observers** ({@link WorkflowObserver}) are push-only — no reads. **WorkflowStore** supports
 * queries (`listRuns`, `listEvents`, `getStepOutput`) for UI and step skip on retry.
 * {@link RunRecorder} writes to both when configured. Separate from {@link MessageStore}.
 *
 * Default implementation: {@link inMemoryWorkflowStore}.
 */
export interface WorkflowStore {
  recordEvent(event: RunEvent): Promise<void>;

  /**
   * Read events for a workflow run or a standalone agent episode.
   * Workflow-scoped queries return workflow + step + custom events for that `workflowRunId`.
   * Agent-scoped queries return agent events for that `agentCallId`.
   */
  listEvents(scope: ListEventsScope, filter?: ListEventsFilter): Promise<RunEvent[]>;

  getLatestEvent<T extends RunEventType>(
    scope: ListEventsScope,
    type: T,
  ): Promise<RunEventOfType<T> | null>;

  getRun(workflowRunId: string): Promise<WorkflowRunSummary | null>;
  listRuns(filter?: { workflowId?: string; limit?: number }): Promise<WorkflowRunSummary[]>;
  getRunInput(workflowRunId: string): Promise<unknown | null>;
  getRunOutput(workflowRunId: string): Promise<unknown | null>;
  getStepOutput(workflowRunId: string, slot: StepSlot): Promise<unknown | null>;
  getStepById(workflowRunId: string, stepId: string): Promise<StepRecord | null>;

  /** Set a display title without changing {@link WorkflowRunSummary.workflowRunId}. */
  setRunTitle(workflowRunId: string, title: string): Promise<void>;
  /** Remove a run and its events / step records. */
  deleteRun(workflowRunId: string): Promise<void>;

  /** Standalone and in-workflow agent episodes, newest first. */
  listAgentEpisodes(filter?: { agentId?: string; limit?: number }): Promise<AgentEpisodeSummary[]>;
}
