/** Append-only run event union for SSE / waterfall UI. @see notes/streaming-api.md */
export type RunEvent =
  | RunStartedEvent
  | RunFinishedEvent
  | RunFailedEvent
  | RunCancelledEvent
  | StepStartedEvent
  | StepFinishedEvent
  | StepSkippedEvent
  | StepFailedEvent
  | AgentStartedEvent
  | AgentFinishedEvent
  | TextDeltaEvent
  | MessagesCommittedEvent
  | CustomRunEvent;

export type RunEventBase = {
  runId: string;
  seq: number;
  at: string;
};

export type RunStartedEvent = RunEventBase & {
  type: "run_started";
  workflowId: string;
  input: unknown;
};

export type RunFinishedEvent = RunEventBase & {
  type: "run_finished";
  output: unknown;
};

export type RunFailedEvent = RunEventBase & {
  type: "run_failed";
  error: unknown;
};

export type RunCancelledEvent = RunEventBase & {
  type: "run_cancelled";
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
  stepId: string | null;
  agentId: string;
  memoryScope: string;
};

export type AgentFinishedEvent = RunEventBase & {
  type: "agent_finished";
  stepId: string | null;
  agentId: string;
};

export type TextDeltaEvent = RunEventBase & {
  type: "text_delta";
  stepId: string | null;
  agentCallId?: string;
  delta: string;
};

export type MessagesCommittedEvent = RunEventBase & {
  type: "messages_committed";
  stepId: string | null;
  memoryScope: string;
  count: number;
};

export type CustomRunEvent = RunEventBase & {
  type: "custom";
  name: string;
  payload: unknown;
};

export type RunSummary = {
  runId: string;
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

export type RunStartPayload = {
  runId: string;
  workflowId: string;
};

export type RunCompletePayload = RunStartPayload & { output: unknown };
export type RunCancelPayload = RunStartPayload;
export type RunErrorPayload = RunStartPayload & { error: unknown };

export type StepStartPayload = {
  runId: string;
  stepId: string;
  parentStepId: string | null;
  name: string;
  key?: string;
  path: string[];
  startedAt: string;
};

export type StepCompletePayload = StepStartPayload & {
  durationMs: number;
  output: unknown;
  input?: unknown;
};

export type StepErrorPayload = StepStartPayload & { error: unknown };
export type CustomEventPayload = {
  runId: string;
  stepId: string;
  name: string;
  payload: unknown;
};

export type AgentStartPayload = {
  runId: string;
  stepId: string | null;
  agentId: string;
  memoryScope: string;
};

export type AgentMessagesPayload = AgentStartPayload & {
  messageCount: number;
};

export type AgentStreamPayload = AgentStartPayload & {
  delta: string;
  agentCallId?: string;
};

export type ToolCallPayload = AgentStartPayload & {
  toolCallId: string;
  toolName: string;
};

export type ToolResultPayload = ToolCallPayload & {
  result: unknown;
};

export type MessagesCommittedPayload = AgentStartPayload & {
  count: number;
};

export type AgentCompletePayload = AgentStartPayload;
export type AgentErrorPayload = AgentStartPayload & { error: unknown };

export type AgentRunEventPayload = AgentStartPayload & {
  type: string;
  data?: unknown;
};
