import type {
  AgentCompletePayload,
  AgentErrorPayload,
  AgentMessagesPayload,
  AgentStartPayload,
  AgentStreamPayload,
  CustomEventPayload,
  MessagesCommittedPayload,
  RunCancelPayload,
  RunCompletePayload,
  RunErrorPayload,
  RunStartPayload,
  StepCompletePayload,
  StepErrorPayload,
  StepStartPayload,
  ToolCallPayload,
  ToolResultPayload,
} from "./events";

/** Push-only workflow telemetry — no reads. @see notes/observability-api.md */
export interface WorkflowObserver {
  onRunStart?(event: RunStartPayload): void | Promise<void>;
  onRunComplete?(event: RunCompletePayload): void | Promise<void>;
  onRunCancel?(event: RunCancelPayload): void | Promise<void>;
  onRunError?(event: RunErrorPayload): void | Promise<void>;
  onStepStart?(event: StepStartPayload): void | Promise<void>;
  onStepComplete?(event: StepCompletePayload): void | Promise<void>;
  onStepError?(event: StepErrorPayload): void | Promise<void>;
  onCustomEvent?(event: CustomEventPayload): void | Promise<void>;
}

/** Push-only agent telemetry — no reads. */
export interface AgentObserver {
  onAgentStart?(event: AgentStartPayload): void | Promise<void>;
  onMessages?(event: AgentMessagesPayload): void | Promise<void>;
  onStream?(event: AgentStreamPayload): void | Promise<void>;
  onToolCall?(event: ToolCallPayload): void | Promise<void>;
  onToolResult?(event: ToolResultPayload): void | Promise<void>;
  onMessagesCommitted?(event: MessagesCommittedPayload): void | Promise<void>;
  onAgentComplete?(event: AgentCompletePayload): void | Promise<void>;
  onAgentError?(event: AgentErrorPayload): void | Promise<void>;
}

export type WorkflowObservers = WorkflowObserver[];
export type AgentObservers = AgentObserver[];
