import type { AdlRuntime } from "../runtime/types";
import type { AdlRuntimeOverrides } from "../runtime/types";
import { AdlNotImplementedError } from "../internal/not-implemented";
import type { Workflow, WorkflowDefinition, WorkflowRunHandle, WorkflowRunOptions } from "./types";

/** Functional factory: workflow definition plus explicit {@link AdlRuntime}. */
export type CreateWorkflowParams<TInput, TOutput> = WorkflowDefinition<TInput, TOutput> & {
  runtime: AdlRuntime;
} & AdlRuntimeOverrides;

export function createWorkflow<TInput, TOutput>(
  params: CreateWorkflowParams<TInput, TOutput>,
): Workflow<TInput, TOutput> {
  const { id, runtime } = params;
  if (!id || typeof id !== "string") {
    throw new Error('createWorkflow: "id" must be a non-empty string');
  }

  void runtime;

  return {
    id,
    run(input: TInput, options: WorkflowRunOptions): WorkflowRunHandle<TOutput> {
      void input;
      void options;
      const error = new AdlNotImplementedError(`workflow.run (${id})`);
      return {
        result: Promise.reject(error),
        cancel: () => {},
      };
    },
  };
}
