import type { AdlRuntime, AdlRuntimeOverrides, RuntimeServices } from "../runtime/types";
import { resolveRuntimeOverrides, splitFactoryParams } from "../runtime/resolve-overrides";
import { AdlNotImplementedError } from "../internal/not-implemented";
import type { Workflow, WorkflowDefinition, WorkflowRunHandle } from "./types";

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
  const { id, runtime, services, run: runFn } = params;
  if (!id || typeof id !== "string") {
    throw new Error('createWorkflow: "id" must be a non-empty string');
  }

  return {
    id,
    run(input: TInput): WorkflowRunHandle<TOutput> {
      void runtime;
      void services;
      void runFn;
      void input;
      // Implementation: const ctx = createWorkflowRunContext(runtime, services);
      const error = new AdlNotImplementedError(`workflow.run (${id})`);
      return {
        workflowRunId: "",
        result: Promise.reject(error),
        cancel: () => {},
      };
    },
  };
}
