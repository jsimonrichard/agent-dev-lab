/**
 * Append-only event union for waterfall UI and {@link WorkflowStore.listEvents}.
 *
 * Includes workflow lifecycle, step tree, agent episodes (`agent_text_delta` when streaming),
 * `custom` events from `WorkflowContext.emit`, and title events (`workflow_title_set`,
 * `agent_title_set`). `runSeq` is monotonic per `workflowRunId` or `agentCallId`
 * (one counter per run / standalone episode). Distinct from {@link LoggedRunEvent.logSeq},
 * which is process-global on the in-memory event log.
 */

/** Current persisted {@link RunEvent} schema. Bump when the wire shape changes. */
export const EVENT_SCHEMA_VERSION = 2;

/** Workflow + step events (always tied to a workflow invocation). */
export type WorkflowRunEventBase = {
  workflowRunId: string;
  runSeq: number;
  at: string;
  eventSchemaVersion: number;
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
  runSeq: number;
  at: string;
  eventSchemaVersion: number;
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

export type WorkflowTitleSetEvent = WorkflowRunEventBase & {
  type: "workflow_title_set";
  /** Omitted when set at workflow root (no active step). */
  stepId?: string | null;
  title: string;
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

/** Non-fatal diagnostics for an agent episode (e.g. system-prompt conflict). */
export type AgentWarningEvent = AgentEventBase & {
  type: "agent_warning";
  agentId: string;
  memoryScope: string;
  code: "system_prompt_conflict";
  message: string;
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
  /** Model response messages appended this episode (excludes the user turn). */
  count: number;
  /** MessageStore transcript length after this commit. */
  total: number;
};

export type AgentTitleSetEvent = AgentEventBase & {
  type: "agent_title_set";
  memoryScope: string;
  title: string;
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
  | WorkflowTitleSetEvent
  | AgentStartedEvent
  | AgentFinishedEvent
  | AgentFailedEvent
  | AgentWarningEvent
  | AgentToolCallEvent
  | AgentToolResultEvent
  | AgentTextDeltaEvent
  | AgentMessagesCommittedEvent
  | AgentTitleSetEvent;

export type RunEventType = RunEvent["type"];

export type RunEventOfType<T extends RunEventType> = Extract<RunEvent, { type: T }>;

/** Event payload before {@link RunRecorder} assigns `runSeq` / `at` / schema version. */
export type RunEventEmit = {
  [T in RunEvent as T["type"]]: Omit<T, "runSeq" | "at" | "eventSchemaVersion">;
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
  | WorkflowCustomEvent
  | WorkflowTitleSetEvent;

/** Agent episodes — may omit `workflowRunId` when not started from a workflow. */
export type AgentObserverEvent =
  | AgentStartedEvent
  | AgentFinishedEvent
  | AgentFailedEvent
  | AgentWarningEvent
  | AgentToolCallEvent
  | AgentToolResultEvent
  | AgentTextDeltaEvent
  | AgentMessagesCommittedEvent
  | AgentTitleSetEvent;

export type WorkflowRunSummary = {
  workflowRunId: string;
  workflowId: string;
  status: "running" | "ok" | "error" | "cancelled";
  startedAt: string;
  finishedAt?: string;
  /** Inspector display name; omitted until the user renames the run. */
  title?: string;
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
