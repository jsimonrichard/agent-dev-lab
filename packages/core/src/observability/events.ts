/**
 * Append-only run event union for SSE / waterfall UI.
 *
 * Every event shares `workflowRunId` — the id for one top-level workflow invocation.
 * Steps are addressed with `stepId`; agent episodes with `agentCallId` (when applicable).
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

export type WorkflowRunStartedEvent = RunEventBase & {
  type: "workflow_run_started";
  workflowId: string;
  input: unknown;
};

export type WorkflowRunFinishedEvent = RunEventBase & {
  type: "workflow_run_finished";
  output: unknown;
};

export type WorkflowRunFailedEvent = RunEventBase & {
  type: "workflow_run_failed";
  error: unknown;
};

export type WorkflowRunCancelledEvent = RunEventBase & {
  type: "workflow_run_cancelled";
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
  type: "workflow_custom";
  stepId: string;
  name: string;
  payload: unknown;
};

/** All workflow + step + agent events emitted during a workflow run. */
export type RunEvent =
  | WorkflowRunStartedEvent
  | WorkflowRunFinishedEvent
  | WorkflowRunFailedEvent
  | WorkflowRunCancelledEvent
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

/** Events a {@link WorkflowObserver} typically handles (workflow + steps + custom). */
export type WorkflowObserverEvent =
  | WorkflowRunStartedEvent
  | WorkflowRunFinishedEvent
  | WorkflowRunFailedEvent
  | WorkflowRunCancelledEvent
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
