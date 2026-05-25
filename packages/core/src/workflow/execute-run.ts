import { createId } from "../internal/ids";
import { serializeError } from "../internal/serialize-error";
import { RunRecorder, withActiveSpan } from "../runtime/run-recorder";
import type { RuntimeServices } from "../runtime/types";
import type { AgentObservers, WorkflowObservers } from "../observability/observers";
import { runWithActiveWorkflowContext } from "./active-workflow-context";
import { createWorkflowContext, refreshWorkflowContext } from "./context";
import type { NestedWorkflowRunOptions } from "./types";
import type { WorkflowContext, WorkflowDefinition } from "./types";

export type ExecuteWorkflowRunOptions = {
  /** Reuse an existing root or nested context (same `workflowRunId` for step cache). */
  parentCtx?: WorkflowContext;
  /** Pre-allocated run id (e.g. for workflow.stream subscription before execution). */
  workflowRunId?: string;
  /** Observers merged for this run only (e.g. in-process event stream). */
  extraObservers?: {
    workflows?: WorkflowObservers;
    agents?: AgentObservers;
  };
};

function mergeServicesForRun(
  services: RuntimeServices,
  extra?: ExecuteWorkflowRunOptions["extraObservers"],
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

export async function executeWorkflowRun<TInput, TOutput>(
  definition: WorkflowDefinition<TInput, TOutput>,
  input: TInput,
  services: RuntimeServices,
  options?: ExecuteWorkflowRunOptions,
  abortController?: AbortController,
): Promise<TOutput> {
  const parentCtx = options?.parentCtx;
  const workflowRunId = options?.workflowRunId ?? parentCtx?.workflowRunId ?? createId();

  const parsedInput = definition.input ? definition.input.parse(input) : input;
  const controller = abortController ?? new AbortController();

  const effectiveServices = mergeServicesForRun(services, options?.extraObservers);
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
      "adl.workflow_id": definition.id,
    },
    async () => {
      await runRecorder.emit({
        type: "workflow_started",
        workflowRunId,
        workflowId: definition.id,
        input: parsedInput,
      });

      try {
        const output = await runWithActiveWorkflowContext(rootCtx, () =>
          definition.run(parsedInput, rootCtx),
        );
        const parsedOutput = definition.output ? definition.output.parse(output) : output;

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

export function executeWorkflowRunWithCancel<TInput, TOutput>(
  definition: WorkflowDefinition<TInput, TOutput>,
  input: TInput,
  services: RuntimeServices,
  options?: ExecuteWorkflowRunOptions,
): { workflowRunId: string; result: Promise<TOutput>; cancel: () => void } {
  const workflowRunId = options?.workflowRunId ?? options?.parentCtx?.workflowRunId ?? createId();
  const abortController = new AbortController();
  return {
    workflowRunId,
    result: executeWorkflowRun(
      definition,
      input,
      services,
      { ...options, workflowRunId },
      abortController,
    ),
    cancel: () => abortController.abort(),
  };
}

/** @internal Nested workflow invocation from a parent step. */
export function executeNestedWorkflowRun<TInput, TOutput>(
  definition: WorkflowDefinition<TInput, TOutput>,
  input: TInput,
  services: RuntimeServices,
  nested: NestedWorkflowRunOptions,
): Promise<TOutput> {
  return executeWorkflowRun(definition, input, services, { parentCtx: nested.parentCtx });
}
