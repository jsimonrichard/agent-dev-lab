import { createId } from "../internal/ids";
import { EventLog } from "../runtime/event-log";
import type { RuntimeServices } from "../runtime/types";
import { createWorkflowContext, refreshWorkflowContext } from "./context";
import { enterWorkflowContext, exitWorkflowContext } from "./run-stack";
import type { NestedWorkflowRunOptions } from "./types";
import type { WorkflowContext, WorkflowDefinition } from "./types";

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

  const eventLog = new EventLog(services, { workflowRunId });

  await eventLog.emit({
    type: "workflow_started",
    workflowRunId,
    workflowId: definition.id,
    input: parsedInput,
    seq: 0,
    at: "",
  });

  const rootCtx = parentCtx
    ? refreshWorkflowContext(parentCtx, services)
    : createWorkflowContext({
        workflowRunId,
        services,
        stepId: null,
        parentStepId: null,
        stepPath: [],
        registryParentKey: workflowRunId,
      });

  enterWorkflowContext(rootCtx);
  try {
    const output = await definition.run(parsedInput, rootCtx);
    const parsedOutput = definition.output ? definition.output.parse(output) : output;

    if (controller.signal.aborted) {
      await eventLog.emit({
        type: "workflow_cancelled",
        workflowRunId,
        seq: 0,
        at: "",
      });
      throw controller.signal.reason ?? new Error("Workflow run cancelled");
    }

    await eventLog.emit({
      type: "workflow_finished",
      workflowRunId,
      output: parsedOutput,
      seq: 0,
      at: "",
    });

    return parsedOutput;
  } catch (error) {
    if (controller.signal.aborted) {
      await eventLog.emit({
        type: "workflow_cancelled",
        workflowRunId,
        seq: 0,
        at: "",
      });
    } else {
      await eventLog.emit({
        type: "workflow_failed",
        workflowRunId,
        error: serializeError(error),
        seq: 0,
        at: "",
      });
    }
    throw error;
  } finally {
    exitWorkflowContext();
  }
}

export function executeWorkflowRunWithCancel<TInput, TOutput>(
  definition: WorkflowDefinition<TInput, TOutput>,
  input: TInput,
  services: RuntimeServices,
  options?: ExecuteWorkflowRunOptions,
): { workflowRunId: string; result: Promise<TOutput>; cancel: () => void } {
  const workflowRunId = options?.parentCtx?.workflowRunId ?? createId();
  const abortController = new AbortController();
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
      }),
  };
  return {
    workflowRunId,
    result: executeWorkflowRun(definition, input, services, runOptions, abortController),
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
