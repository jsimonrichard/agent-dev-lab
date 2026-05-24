import type { AgentObserverEvent, WorkflowObserverEvent } from "./events";

/**
 * ## Single `onEvent` vs many `onStepStart` / `onRunComplete` / … methods
 *
 * ### `onEvent` (current)
 *
 * **Pros**
 * - One method per observer — small adapters (stdout, OTel, tests) stay short.
 * - New event types don’t require interface changes; consumers `switch (event.type)`.
 * - Same discriminated union as {@link RunEvent} / {@link WorkflowStore.listEvents}
 *   — easy to forward store → observer or observer → log sink.
 * - Fits functional pipelines: `observers.map((o) => o.onEvent?.(e))`.
 *
 * **Cons**
 * - Handlers are one big `switch` unless split with helper functions.
 * - Can’t satisfy “only implement step hooks” via TypeScript interface segregation
 *   (mitigate with `WorkflowObserverEvent` vs `AgentObserverEvent` unions).
 * - Slightly worse ergonomics for “run this on every `step_started`” in isolation
 *   (use `if (event.type === "step_started")` or a small wrapper).
 *
 * ### Many optional methods (previous sketch)
 *
 * **Pros**
 * - Familiar OpenTelemetry / analytics style; IDE autocomplete per hook.
 * - Handlers stay tiny when you only care about one phase.
 *
 * **Cons**
 * - Interface grows with every event; breaking or bloated when adding `agent_tool_call`.
 * - Fan-out in the runtime is repetitive (`onStepStart?.()` × N observers).
 * - Duplicates the `RunEvent` discriminant in method names.
 *
 * ### Recommendation
 *
 * Keep **`onEvent`** for v1. If we need ergonomics later, add optional helpers such as
 * `createWorkflowObserver({ onStepStart: (e) => … })` that implement `onEvent` internally
 * — without changing the core interface.
 *
 * @see notes/observability-api.md
 */

/** Push-only workflow telemetry (workflow + step + custom events). */
export interface WorkflowObserver {
  onEvent?(event: WorkflowObserverEvent): void | Promise<void>;
}

/** Push-only agent telemetry. */
export interface AgentObserver {
  onEvent?(event: AgentObserverEvent): void | Promise<void>;
}

export type WorkflowObservers = WorkflowObserver[];
export type AgentObservers = AgentObserver[];
