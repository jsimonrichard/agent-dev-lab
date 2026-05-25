import { createId } from "../internal/ids";
import { RunRecorder, withActiveSpan } from "../runtime/run-recorder";
import type { RuntimeServices } from "../runtime/types";
import {
  asWorkflowContextImpl,
  createWorkflowContext,
  refreshWorkflowContext,
} from "./context";
import type { NestedWorkflowRunOptions } from "./types";
import type { WorkflowContext, WorkflowDefinition } from "./types";
import { runWithWorkflowRunStack, WorkflowRunStack } from "./workflow-run-stack";

export type ExecuteWorkflowRunOptions = {
  /** Reuse an existing root or nested context (same `workflowRunId` for step cache). */
  parentCtx?: WorkflowContext;
};

export async function executeWorkflowRun<TInput, TOutput>(
  definition: WorkflowDefinition<TInput, TOutput>,
  input: TInput,
  services: RuntimeServices,
  options?: ExecuteWorkflowRunOptions,
  abortController?: AbortController,
): Promise<TOutput> {
  const parentCtx = options?.parentCtx;
  const workflowRunId = parentCtx?.workflowRunId ?? createId();

  const parsedInput = definition.input ? definition.input.parse(input) : input;
  const controller = abortController ?? new AbortController();

  const runRecorder = new RunRecorder(services);
  const inheritedRunStack = parentCtx ? asWorkflowContextImpl(parentCtx).runStack : undefined;
  const runStack = inheritedRunStack ?? new WorkflowRunStack();

  const rootCtx = parentCtx
    ? refreshWorkflowContext(parentCtx, services)
    : createWorkflowContext({
        workflowRunId,
        services,
        stepId: null,
        parentStepId: null,
        stepPath: [],
        registryParentKey: workflowRunId,
        runStack,
      });

  const runBody = async (): Promise<TOutput> =>
    withActiveSpan(
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
          seq: 0,
          at: "",
        });

        runStack.push(rootCtx);
        try {
          const output = await definition.run(parsedInput, rootCtx);
          const parsedOutput = definition.output ? definition.output.parse(output) : output;

          if (controller.signal.aborted) {
            await runRecorder.emit({
              type: "workflow_cancelled",
              workflowRunId,
              seq: 0,
              at: "",
            });
            throw controller.signal.reason ?? new Error("Workflow run cancelled");
          }

          await runRecorder.emit({
            type: "workflow_finished",
            workflowRunId,
            output: parsedOutput,
            seq: 0,
            at: "",
          });

          return parsedOutput;
        } catch (error) {
          if (controller.signal.aborted) {
            await runRecorder.emit({
              type: "workflow_cancelled",
              workflowRunId,
              seq: 0,
              at: "",
            });
          } else {
            await runRecorder.emit({
              type: "workflow_failed",
              workflowRunId,
              error: serializeError(error),
              seq: 0,
              at: "",
            });
          }
          throw error;
        } finally {
          runStack.pop();
        }
      },
    );

  if (inheritedRunStack) {
    return runBody();
  }
  return runWithWorkflowRunStack(runStack, runBody);
}

export function executeWorkflowRunWithCancel<TInput, TOutput>(
  definition: WorkflowDefinition<TInput, TOutput>,
  input: TInput,
  services: RuntimeServices,
  options?: ExecuteWorkflowRunOptions,
): { workflowRunId: string; result: Promise<TOutput>; cancel: () => void } {
  const workflowRunId = options?.parentCtx?.workflowRunId ?? createId();
  const abortController = new AbortController();
  const runStack = options?.parentCtx
    ? asWorkflowContextImpl(options.parentCtx).runStack
    : new WorkflowRunStack();
  const runOptions: ExecuteWorkflowRunOptions = {
    ...options,
    parentCtx:
      options?.parentCtx ??
      createWorkflowContext({
        workflowRunId,
        services,
        stepId: null,
        parentStepId: null,
        stepPath: [],
        registryParentKey: workflowRunId,
        runStack,
      }),
  };
  const runPromise = options?.parentCtx
    ? executeWorkflowRun(definition, input, services, runOptions, abortController)
    : runWithWorkflowRunStack(runStack, () =>
        executeWorkflowRun(definition, input, services, runOptions, abortController),
      );
  return {
    workflowRunId,
    result: runPromise,
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

function serializeError(error: unknown): unknown {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return error;
}
