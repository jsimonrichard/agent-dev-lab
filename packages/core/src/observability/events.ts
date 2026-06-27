/**
 * Append-only event union for SSE / waterfall UI.
 *
 * - **Workflow run events** require `workflowRunId` (workflow + step + in-workflow custom).
 * - **Agent events** require `agentCallId`; `workflowRunId` and `stepId` are optional
 *   (agents may run outside a workflow, or between steps at workflow root).
 *
 * @see apps/docs — core/streaming
 */

/** Workflow + step events (always tied to a workflow invocation). */
export type WorkflowRunEventBase = {
  workflowRunId: string;
  seq: number;
  at: string;
};

/**
 * Agent episode events. Agents may run standalone (`workflowRunId` omitted) or inside
 * a workflow (`workflowRunId` set). `stepId` is set when the call runs inside `ctx.step`;
 * omitted at workflow root or outside workflows.
 */
export type AgentEventBase = {
  agentCallId: string;
  workflowRunId?: string;
  stepId?: string | null;
  seq: number;
  at: string;
};

export type WorkflowStartedEvent = WorkflowRunEventBase & {
  type: "workflow_started";
  workflowId: string;
  input: unknown;
};

export type WorkflowFinishedEvent = WorkflowRunEventBase & {
  type: "workflow_finished";
  output: unknown;
};

export type WorkflowFailedEvent = WorkflowRunEventBase & {
  type: "workflow_failed";
  error: unknown;
};

export type WorkflowCancelledEvent = WorkflowRunEventBase & {
  type: "workflow_cancelled";
};

export type StepStartedEvent = WorkflowRunEventBase & {
  type: "step_started";
  stepId: string;
  parentStepId: string | null;
  name: string;
  key?: string;
  path: string[];
};

export type StepFinishedEvent = WorkflowRunEventBase & {
  type: "step_finished";
  stepId: string;
  parentStepId: string | null;
  name: string;
  key?: string;
  path: string[];
  status: "ok";
  durationMs: number;
  output: unknown;
};

export type StepSkippedEvent = WorkflowRunEventBase & {
  type: "step_skipped";
  stepId: string;
  parentStepId: string | null;
  name: string;
  key?: string;
  path: string[];
  output: unknown;
};

export type StepFailedEvent = WorkflowRunEventBase & {
  type: "step_failed";
  stepId: string;
  parentStepId: string | null;
  name: string;
  key?: string;
  path: string[];
  error: unknown;
};

export type WorkflowCustomEvent = WorkflowRunEventBase & {
  type: "custom";
  /** Omitted when emitted at workflow root (no active step). */
  stepId?: string | null;
  name: string;
  payload: unknown;
};

export type AgentStartedEvent = AgentEventBase & {
  type: "agent_started";
  agentId: string;
  memoryScope: string;
};

export type AgentFinishedEvent = AgentEventBase & {
  type: "agent_finished";
  agentId: string;
};

export type AgentFailedEvent = AgentEventBase & {
  type: "agent_failed";
  agentId: string;
  error: unknown;
};

export type AgentToolCallEvent = AgentEventBase & {
  type: "agent_tool_call";
  agentId: string;
  toolCallId: string;
  toolName: string;
};

export type AgentToolResultEvent = AgentEventBase & {
  type: "agent_tool_result";
  agentId: string;
  toolCallId: string;
  toolName: string;
  result: unknown;
};

export type AgentTextDeltaEvent = AgentEventBase & {
  type: "agent_text_delta";
  delta: string;
};

export type AgentMessagesCommittedEvent = AgentEventBase & {
  type: "agent_messages_committed";
  memoryScope: string;
  count: number;
};

export type RunEvent =
  | WorkflowStartedEvent
  | WorkflowFinishedEvent
  | WorkflowFailedEvent
  | WorkflowCancelledEvent
  | StepStartedEvent
  | StepFinishedEvent
  | StepSkippedEvent
  | StepFailedEvent
  | WorkflowCustomEvent
  | AgentStartedEvent
  | AgentFinishedEvent
  | AgentFailedEvent
  | AgentToolCallEvent
  | AgentToolResultEvent
  | AgentTextDeltaEvent
  | AgentMessagesCommittedEvent;

export type RunEventType = RunEvent["type"];

export type RunEventOfType<T extends RunEventType> = Extract<RunEvent, { type: T }>;

/** Event payload before {@link RunRecorder} assigns `seq` / `at` for store persistence. */
export type RunEventEmit = {
  [T in RunEvent as T["type"]]: Omit<T, "seq" | "at">;
}[RunEventType];

/** Workflow + step + in-workflow custom events. */
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

/** Agent episodes — may omit `workflowRunId` when not started from a workflow. */
export type AgentObserverEvent =
  | AgentStartedEvent
  | AgentFinishedEvent
  | AgentFailedEvent
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
