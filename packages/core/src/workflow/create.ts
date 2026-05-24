import type { AdlRuntime, AdlRuntimeOverrides, RuntimeServices } from "../runtime/types";
import { AdlNotImplementedError } from "../internal/not-implemented";
import type { Workflow, WorkflowContext, WorkflowDefinition, WorkflowRunHandle } from "./types";

/** Functional factory: workflow definition plus explicit {@link AdlRuntime}. */
export type CreateWorkflowParams<TInput, TOutput> = WorkflowDefinition<TInput, TOutput> & {
  runtime: AdlRuntime;
  /** Effective services (runtime + overrides). Set by `adl.createWorkflow`. */
  services?: RuntimeServices;
} & AdlRuntimeOverrides;

export function createWorkflow<TInput, TOutput>(
  params: CreateWorkflowParams<TInput, TOutput>,
): Workflow<TInput, TOutput> {
  const { id, runtime, services } = params;
  if (!id || typeof id !== "string") {
    throw new Error('createWorkflow: "id" must be a non-empty string');
  }

  void runtime;
  void services;

  return {
    id,
    run(input: TInput, ctx: WorkflowContext): WorkflowRunHandle<TOutput> {
      void input;
      void ctx;
      const error = new AdlNotImplementedError(`workflow.run (${id})`);
      return {
        result: Promise.reject(error),
        cancel: () => {},
      };
    },
  };
}
