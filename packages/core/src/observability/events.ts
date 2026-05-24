/**
 * Append-only run event union for SSE / waterfall UI.
 *
 * Every event shares `workflowRunId` — the id for one top-level workflow invocation.
 * Steps use `stepId`; agent episodes use `agentCallId`.
 *
 * @see notes/streaming-api.md
 */

/** Shared envelope for persisted / streamed run events. */
export type RunEventBase = {
  /** Id of the workflow invocation (not a step or agent episode). */
  workflowRunId: string;
  seq: number;
  at: string;
};

export type WorkflowStartedEvent = RunEventBase & {
  type: "workflow_started";
  workflowId: string;
  input: unknown;
};

export type WorkflowFinishedEvent = RunEventBase & {
  type: "workflow_finished";
  output: unknown;
};

export type WorkflowFailedEvent = RunEventBase & {
  type: "workflow_failed";
  error: unknown;
};

export type WorkflowCancelledEvent = RunEventBase & {
  type: "workflow_cancelled";
};

export type StepStartedEvent = RunEventBase & {
  type: "step_started";
  stepId: string;
  parentStepId: string | null;
  name: string;
  key?: string;
  path: string[];
};

export type StepFinishedEvent = RunEventBase & {
  type: "step_finished";
  stepId: string;
  status: "ok";
  durationMs: number;
  output: unknown;
};

export type StepSkippedEvent = RunEventBase & {
  type: "step_skipped";
  stepId: string;
  name: string;
  key?: string;
  output: unknown;
};

export type StepFailedEvent = RunEventBase & {
  type: "step_failed";
  stepId: string;
  error: unknown;
};

export type AgentStartedEvent = RunEventBase & {
  type: "agent_started";
  agentCallId: string;
  stepId: string | null;
  agentId: string;
  memoryScope: string;
};

export type AgentFinishedEvent = RunEventBase & {
  type: "agent_finished";
  agentCallId: string;
  stepId: string | null;
  agentId: string;
};

export type AgentToolCallEvent = RunEventBase & {
  type: "agent_tool_call";
  agentCallId: string;
  stepId: string | null;
  agentId: string;
  toolCallId: string;
  toolName: string;
};

export type AgentToolResultEvent = RunEventBase & {
  type: "agent_tool_result";
  agentCallId: string;
  stepId: string | null;
  agentId: string;
  toolCallId: string;
  toolName: string;
  result: unknown;
};

export type AgentTextDeltaEvent = RunEventBase & {
  type: "agent_text_delta";
  agentCallId: string;
  stepId: string | null;
  delta: string;
};

export type AgentMessagesCommittedEvent = RunEventBase & {
  type: "agent_messages_committed";
  agentCallId: string;
  stepId: string | null;
  memoryScope: string;
  count: number;
};

export type WorkflowCustomEvent = RunEventBase & {
  type: "custom";
  stepId: string;
  name: string;
  payload: unknown;
};

/** All events emitted during a workflow invocation. */
export type RunEvent =
  | WorkflowStartedEvent
  | WorkflowFinishedEvent
  | WorkflowFailedEvent
  | WorkflowCancelledEvent
  | StepStartedEvent
  | StepFinishedEvent
  | StepSkippedEvent
  | StepFailedEvent
  | AgentStartedEvent
  | AgentFinishedEvent
  | AgentToolCallEvent
  | AgentToolResultEvent
  | AgentTextDeltaEvent
  | AgentMessagesCommittedEvent
  | WorkflowCustomEvent;

export type RunEventType = RunEvent["type"];

/** Narrow {@link RunEvent} by discriminant `type`. */
export type RunEventOfType<T extends RunEventType> = Extract<RunEvent, { type: T }>;

/** Events a {@link WorkflowObserver} typically handles (workflow + steps + custom). */
export type WorkflowObserverEvent =
  | WorkflowStartedEvent
  | WorkflowFinishedEvent
  | WorkflowFailedEvent
  | WorkflowCancelledEvent
  | StepStartedEvent
  | StepFinishedEvent
  | StepSkippedEvent
  | StepFailedEvent
  | WorkflowCustomEvent;

/** Events an {@link AgentObserver} typically handles. */
export type AgentObserverEvent =
  | AgentStartedEvent
  | AgentFinishedEvent
  | AgentToolCallEvent
  | AgentToolResultEvent
  | AgentTextDeltaEvent
  | AgentMessagesCommittedEvent;

export type WorkflowRunSummary = {
  workflowRunId: string;
  workflowId: string;
  status: "running" | "ok" | "error" | "cancelled";
  startedAt: string;
  finishedAt?: string;
};

/** @deprecated Use {@link WorkflowRunSummary}. */
export type RunSummary = WorkflowRunSummary;

/** @deprecated Use {@link WorkflowStartedEvent}. */
export type WorkflowRunStartedEvent = WorkflowStartedEvent;
/** @deprecated Use {@link WorkflowFinishedEvent}. */
export type WorkflowRunFinishedEvent = WorkflowFinishedEvent;
/** @deprecated Use {@link WorkflowFailedEvent}. */
export type WorkflowRunFailedEvent = WorkflowFailedEvent;
/** @deprecated Use {@link WorkflowCancelledEvent}. */
export type WorkflowRunCancelledEvent = WorkflowCancelledEvent;

export type StepRecord = {
  stepId: string;
  name: string;
  key?: string;
  path: string[];
  parentStepId: string | null;
  input?: unknown;
  output?: unknown;
  status: "ok" | "error";
};

export type StepSlot = {
  parentStepId: string | null;
  name: string;
  key?: string;
};
