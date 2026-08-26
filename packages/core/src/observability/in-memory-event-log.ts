import type { RunEvent } from "./events";
import type { AgentObserver, WorkflowObserver } from "./observers";
import type { EventLog, ListLoggedEventsFilter, LoggedRunEvent } from "./event-log";

export const DEFAULT_EVENT_LOG_MAX_EVENTS = 10_000;

export type InMemoryEventLogOptions = {
  maxEvents?: number;
};

/**
 * Ring-buffer {@link EventLog} that also implements workflow and agent observers.
 * Register the same instance on both `observers.workflows` and `observers.agents` —
 * {@link import("../runtime/run-recorder").RunRecorder} fans events to one list or the other.
 */
export class InMemoryEventLog implements EventLog, WorkflowObserver, AgentObserver {
  private readonly maxEvents: number;
  private readonly events: LoggedRunEvent[] = [];
  private seq = 0;
  private readonly waiters = new Set<() => void>();

  constructor(options: InMemoryEventLogOptions = {}) {
    this.maxEvents = options.maxEvents ?? DEFAULT_EVENT_LOG_MAX_EVENTS;
  }

  onEvent(event: RunEvent): void {
    this.seq += 1;
    this.events.push({ logSeq: this.seq, event });
    if (this.events.length > this.maxEvents) {
      this.events.splice(0, this.events.length - this.maxEvents);
    }
    this.wake();
  }

  list(filter?: ListLoggedEventsFilter): LoggedRunEvent[] {
    let list = this.events;
    if (filter?.afterSeq !== undefined) {
      const afterSeq = filter.afterSeq;
      list = list.filter((entry) => entry.logSeq > afterSeq);
    }
    if (filter?.type) {
      const types = Array.isArray(filter.type) ? filter.type : [filter.type];
      list = list.filter((entry) => types.includes(entry.event.type));
    }
    if (filter?.limit !== undefined) {
      list = list.slice(-filter.limit);
    }
    return list.slice();
  }

  clear(): void {
    this.events.length = 0;
    this.wake();
  }

  waitForAppend(afterSeq: number, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted || this.hasEventAfter(afterSeq)) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const finish = () => {
        this.waiters.delete(wake);
        signal?.removeEventListener("abort", finish);
        resolve();
      };
      const wake = () => {
        if (signal?.aborted || this.hasEventAfter(afterSeq)) {
          finish();
        }
      };
      this.waiters.add(wake);
      signal?.addEventListener("abort", finish, { once: true });
      if (signal?.aborted || this.hasEventAfter(afterSeq)) {
        finish();
      }
    });
  }

  private hasEventAfter(afterSeq: number): boolean {
    const last = this.events.at(-1);
    return last !== undefined && last.logSeq > afterSeq;
  }

  private wake(): void {
    for (const waiter of [...this.waiters]) {
      waiter();
    }
  }
}

/** In-process event log for the inspection UI (and tests). */
export function inMemoryEventLog(options?: InMemoryEventLogOptions): InMemoryEventLog {
  return new InMemoryEventLog(options);
}
