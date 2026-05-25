import { createId } from "../internal/ids";
import { serializeError } from "../internal/serialize-error";
import { RunRecorder, withActiveSpan } from "../runtime/run-recorder";
import type { RuntimeServices } from "../runtime/types";
import type { AgentObservers, WorkflowObservers } from "../observability/observers";
import type { RunEvent } from "../observability/events";
import type { AgentObserver, WorkflowObserver } from "../observability/observers";
import { runWithActiveWorkflowContext } from "./active-workflow-context";
import { createWorkflowContext, refreshWorkflowContext } from "./context";
import type {
  Workflow,
  WorkflowContext,
  WorkflowDefinition,
  WorkflowRunHandle,
  WorkflowStreamHandle,
} from "./types";

/** Options for a single workflow invocation (root, nested, or stream). */
export type WorkflowRunOptions = {
  /** Reuse an existing root or nested context (same `workflowRunId` for step cache). */
  parentCtx?: WorkflowContext;
  /** Pre-allocated run id (e.g. for {@link Workflow.stream} subscription before execution). */
  workflowRunId?: string;
  /** Observers merged for this run only (e.g. in-process {@link WorkflowRunEventChannel}). */
  extraObservers?: {
    workflows?: WorkflowObservers;
    agents?: AgentObservers;
  };
};

/**
 * Default workflow implementation: definition plus resolved runtime services.
 * Execution logic lives on this class (parallel to {@link AgentImpl}).
 */
export class WorkflowImpl<TInput, TOutput> implements Workflow<TInput, TOutput> {
  readonly id: string;

  constructor(
    readonly definition: WorkflowDefinition<TInput, TOutput>,
    readonly services: RuntimeServices,
  ) {
    if (!definition.id || typeof definition.id !== "string") {
      throw new Error('WorkflowImpl: "id" must be a non-empty string');
    }
    this.id = definition.id;
  }

  run(input: TInput): WorkflowRunHandle<TOutput> {
    const handle = this.startRunWithCancel(input);
    return {
      workflowRunId: handle.workflowRunId,
      result: handle.result,
      cancel: handle.cancel,
    };
  }

  stream(input: TInput): WorkflowStreamHandle<TOutput> {
    const workflowRunId = createId();
    const channel = new WorkflowRunEventChannel(workflowRunId);
    const handle = this.startRunWithCancel(input, {
      workflowRunId,
      extraObservers: {
        workflows: [channel.asWorkflowObserver()],
        agents: [channel.asAgentObserver()],
      },
    });
    const result = handle.result.finally(() => channel.close());
    return {
      workflowRunId: handle.workflowRunId,
      events: channel.stream(),
      result,
      cancel: handle.cancel,
    };
  }

  /**
   * Nested workflow invocation from a parent step (used by {@link createToolFromWorkflow}).
   * @internal
   */
  runNested(input: TInput, parentCtx: WorkflowContext): Promise<TOutput> {
    return this.executeRun(input, { parentCtx });
  }

  /**
   * Continue or replay a run with an existing context (step cache). Package tests only.
   * @internal
   */
  executeRun(
    input: TInput,
    options?: WorkflowRunOptions,
    abortController?: AbortController,
  ): Promise<TOutput> {
    const parentCtx = options?.parentCtx;
    const workflowRunId = options?.workflowRunId ?? parentCtx?.workflowRunId ?? createId();

    const parsedInput = this.definition.input ? this.definition.input.parse(input) : input;
    const controller = abortController ?? new AbortController();

    const effectiveServices = mergeServicesForRun(this.services, options?.extraObservers);
    const runRecorder = new RunRecorder(effectiveServices);

    const rootCtx = parentCtx
      ? refreshWorkflowContext(parentCtx, effectiveServices, runRecorder)
      : createWorkflowContext({
          workflowRunId,
          services: effectiveServices,
          stepId: null,
          parentStepId: null,
          stepPath: [],
          registryParentKey: workflowRunId,
          runRecorder,
        });

    return withActiveSpan(
      "workflow.run",
      {
        "adl.workflow_run_id": workflowRunId,
        "adl.workflow_id": this.definition.id,
      },
      async () => {
        await runRecorder.emit({
          type: "workflow_started",
          workflowRunId,
          workflowId: this.definition.id,
          input: parsedInput,
        });

        try {
          const output = await runWithActiveWorkflowContext(rootCtx, () =>
            this.definition.run(parsedInput, rootCtx),
          );
          const parsedOutput = this.definition.output
            ? this.definition.output.parse(output)
            : output;

          if (controller.signal.aborted) {
            await runRecorder.emit({
              type: "workflow_cancelled",
              workflowRunId,
            });
            throw controller.signal.reason ?? new Error("Workflow run cancelled");
          }

          await runRecorder.emit({
            type: "workflow_finished",
            workflowRunId,
            output: parsedOutput,
          });

          return parsedOutput;
        } catch (error) {
          if (controller.signal.aborted) {
            await runRecorder.emit({
              type: "workflow_cancelled",
              workflowRunId,
            });
          } else {
            await runRecorder.emit({
              type: "workflow_failed",
              workflowRunId,
              error: serializeError(error),
            });
          }
          throw error;
        }
      },
    );
  }

  private startRunWithCancel(
    input: TInput,
    options?: WorkflowRunOptions,
  ): { workflowRunId: string; result: Promise<TOutput>; cancel: () => void } {
    const workflowRunId = options?.workflowRunId ?? options?.parentCtx?.workflowRunId ?? createId();
    const abortController = new AbortController();
    return {
      workflowRunId,
      result: this.executeRun(input, { ...options, workflowRunId }, abortController),
      cancel: () => abortController.abort(),
    };
  }
}

/** Resolves the concrete workflow binding created by {@link createWorkflow} / {@link AdlRuntime.createWorkflow}. */
export function getWorkflowImpl<TInput, TOutput>(
  workflow: Workflow<TInput, TOutput>,
): WorkflowImpl<TInput, TOutput> {
  if (!(workflow instanceof WorkflowImpl)) {
    throw new Error(
      "getWorkflowImpl: workflow was not created via createWorkflow / adl.createWorkflow",
    );
  }
  return workflow;
}

function mergeServicesForRun(
  services: RuntimeServices,
  extra?: WorkflowRunOptions["extraObservers"],
): RuntimeServices {
  if (!extra) {
    return services;
  }
  return {
    ...services,
    observers: {
      workflows: [...services.observers.workflows, ...(extra.workflows ?? [])],
      agents: [...services.observers.agents, ...(extra.agents ?? [])],
    },
  };
}

/**
 * In-process buffer + async iterator for {@link WorkflowImpl.stream}.
 *
 * `workflow.stream()` must expose live {@link RunEvent}s without waiting for the workflow store.
 * This registers as extra workflow/agent observers for one run, buffers matching events, and
 * yields them from `stream()` while the run is in flight. Not used by `workflow.run()` alone.
 */
class WorkflowRunEventChannel {
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
