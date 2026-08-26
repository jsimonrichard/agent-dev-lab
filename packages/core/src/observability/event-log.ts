import type { RunEvent, RunEventType } from "./events";

/**
 * Process-global wrapper around a {@link RunEvent}. `logSeq` is monotonic for this
 * log instance (unlike `RunEvent.seq`, which is scoped per workflow run or agent call).
 */
export type LoggedRunEvent = {
  logSeq: number;
  event: RunEvent;
};

export type ListLoggedEventsFilter = {
  afterSeq?: number;
  type?: RunEventType | RunEventType[];
  /** When set, keep the newest matching events (tail), not the oldest. */
  limit?: number;
};

/**
 * Readable process-wide event log. Implementations typically also satisfy
 * `WorkflowObserver` / `AgentObserver` so they can be registered on the runtime.
 *
 * In-memory for now; a SQLite implementation can satisfy the same interface later.
 */
export interface EventLog {
  list(filter?: ListLoggedEventsFilter): LoggedRunEvent[];
  clear(): void;
  /**
   * Resolves when an event with `logSeq > afterSeq` is present, or `signal` aborts.
   * Used by SSE tails so they do not miss events that arrive between `list` and wait.
   */
  waitForAppend(afterSeq: number, signal?: AbortSignal): Promise<void>;
}
