import { createId } from "../internal/ids";
import { serializeError } from "../internal/serialize-error";
import { RunRecorder, withActiveSpan } from "../runtime/run-recorder";
import type { RuntimeServices } from "../runtime/types";
import { runWithActiveWorkflowContext } from "./active-workflow-context";
import { createWorkflowContext, refreshWorkflowContext } from "./context";
import { WorkflowRunEventChannel } from "./workflow-run-event-channel";
import type {
  Workflow,
  WorkflowContext,
  WorkflowDefinition,
  WorkflowRunHandle,
  WorkflowRunStartOptions,
  WorkflowStreamHandle,
} from "./types";

/** @internal Full run options (public start options + nested parent context). */
export type WorkflowRunOptions = WorkflowRunStartOptions & {
  /** Reuse an existing root or nested context (same `workflowRunId` for step cache). */
  parentCtx?: WorkflowContext;
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

  run(input: TInput, options?: WorkflowRunStartOptions): WorkflowRunHandle<TOutput> {
    const handle = this.startRunWithCancel(input, options);
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
  extra?: WorkflowRunStartOptions["extraObservers"],
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
