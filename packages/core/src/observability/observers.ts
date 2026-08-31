import type { AgentObserverEvent, WorkflowObserverEvent } from "./events";

/*
 * Design note (not TypeDoc): keep a single `onEvent` per observer. Optional
 * per-phase helpers can wrap `onEvent` later without changing this interface.
 */

/**
 * Push-only workflow telemetry. Use {@link WorkflowStore} for history and UI replay.
 */
export interface WorkflowObserver {
  onEvent?(event: WorkflowObserverEvent): void | Promise<void>;
}

/**
 * Push-only agent telemetry. Does not replace {@link MessageStore}.
 */
export interface AgentObserver {
  onEvent?(event: AgentObserverEvent): void | Promise<void>;
}

export type WorkflowObservers = WorkflowObserver[];
export type AgentObservers = AgentObserver[];
