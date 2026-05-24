import type { AgentObserverEvent, WorkflowObserverEvent } from "./events";

/**
 * Push-only workflow telemetry — no reads.
 *
 * A single {@link onEvent} handler keeps adapters (stdout, OTel, custom loggers) small:
 * switch on `event.type` instead of implementing many optional methods.
 *
 * @see notes/observability-api.md
 */
export interface WorkflowObserver {
  onEvent?(event: WorkflowObserverEvent): void | Promise<void>;
}

/**
 * Push-only agent telemetry — no reads.
 * Model/tool spans can be mirrored here and via AI SDK `experimental_telemetry`.
 */
export interface AgentObserver {
  onEvent?(event: AgentObserverEvent): void | Promise<void>;
}

export type WorkflowObservers = WorkflowObserver[];
export type AgentObservers = AgentObserver[];
