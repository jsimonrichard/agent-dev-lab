import type { AgentObserver } from "../observability/observers";
import type { RunEvent } from "../observability/events";
import type { WorkflowObserver } from "../observability/observers";

/**
 * In-process fan-out of {@link RunEvent}s for a single workflow run (used by {@link Workflow.stream}).
 */
export class WorkflowRunEventChannel {
  private readonly buffer: RunEvent[] = [];
  private closed = false;
  private wake: (() => void) | null = null;

  constructor(private readonly workflowRunId: string) {}

  asWorkflowObserver(): WorkflowObserver {
    return {
      onEvent: (event) => {
        this.push(event);
      },
    };
  }

  asAgentObserver(): AgentObserver {
    return {
      onEvent: (event) => {
        this.push(event);
      },
    };
  }

  close(): void {
    this.closed = true;
    this.wake?.();
    this.wake = null;
  }

  stream(): AsyncIterable<RunEvent> {
    let index = 0;
    return {
      [Symbol.asyncIterator]: () =>
        this.iterateEvents(
          () => index,
          (n) => (index = n),
        ),
    };
  }

  private async *iterateEvents(
    getIndex: () => number,
    setIndex: (n: number) => void,
  ): AsyncGenerator<RunEvent> {
    while (true) {
      let index = getIndex();
      while (index < this.buffer.length) {
        yield this.buffer[index++]!;
        setIndex(index);
      }
      if (this.closed) {
        return;
      }
      await new Promise<void>((resolve) => {
        this.wake = resolve;
      });
    }
  }

  private push(event: RunEvent): void {
    if (!this.matches(event)) {
      return;
    }
    this.buffer.push(event);
    this.wake?.();
    this.wake = null;
  }

  private matches(event: RunEvent): boolean {
    if ("workflowRunId" in event && event.workflowRunId === this.workflowRunId) {
      return true;
    }
    return "agentCallId" in event && event.workflowRunId === this.workflowRunId;
  }
}
