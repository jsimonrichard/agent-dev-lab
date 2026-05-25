import type { AdlRuntime, AdlRuntimeOverrides, RuntimeServices } from "../runtime/types";
import { resolveRuntimeOverrides, splitFactoryParams } from "../runtime/resolve-overrides";
import type { Workflow, WorkflowDefinition, WorkflowRunHandle } from "./types";
import { bindWorkflow } from "./bindings";
import { executeWorkflowRunWithCancel } from "./execute-run";

/** Functional factory: workflow definition plus explicit {@link AdlRuntime}. */
export type CreateWorkflowParams<TInput, TOutput> = WorkflowDefinition<TInput, TOutput> & {
  runtime: AdlRuntime;
} & AdlRuntimeOverrides;

/** @internal Bound factory input after merging runtime services (not for end users). */
export type CreateWorkflowBoundParams<TInput, TOutput> = WorkflowDefinition<TInput, TOutput> & {
  runtime: AdlRuntime;
  services: RuntimeServices;
};

export function createWorkflow<TInput, TOutput>(
  params: CreateWorkflowParams<TInput, TOutput>,
): Workflow<TInput, TOutput> {
  const { definition, runtime, overrides } = splitFactoryParams(params);
  const services = resolveRuntimeOverrides(runtime.services, overrides);
  return createWorkflowWithServices({ ...definition, runtime, services });
}

/** @internal */
export function createWorkflowWithServices<TInput, TOutput>(
  params: CreateWorkflowBoundParams<TInput, TOutput>,
): Workflow<TInput, TOutput> {
  const { id, services, run: runFn } = params;
  if (!id || typeof id !== "string") {
    throw new Error('createWorkflow: "id" must be a non-empty string');
  }

  const definition: WorkflowDefinition<TInput, TOutput> = {
    id,
    input: params.input,
    output: params.output,
    run: runFn,
  };

  const workflow: Workflow<TInput, TOutput> = {
    id,
    run(input: TInput): WorkflowRunHandle<TOutput> {
      const handle = executeWorkflowRunWithCancel(definition, input, services);
      return {
        workflowRunId: handle.workflowRunId,
        result: handle.result,
        cancel: handle.cancel,
      };
    },
  };

  bindWorkflow(workflow, { definition, services });
  return workflow;
}
