import type { RunEvent } from "../observability/events";
import type { AgentObserver, WorkflowObserver } from "../observability/observers";

/**
 * In-process buffer for {@link WorkflowImpl.stream}.
 *
 * Registers as per-run workflow/agent observers, buffers {@link RunEvent}s for one
 * `workflowRunId`, and exposes an async iterator while the run is in flight. Not part of
 * the public package API — use {@link Workflow.stream} or {@link Workflow.run} with
 * `WorkflowStore` + SSE for production UI.
 *
 * @internal
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
