import type { AdlRuntime, AdlRuntimeOverrides, RuntimeServices } from "../runtime/types";
import { AdlNotImplementedError } from "../internal/not-implemented";
import type { Workflow, WorkflowDefinition, WorkflowRunHandle } from "./types";

/** Functional factory: workflow definition plus explicit {@link AdlRuntime}. */
export type CreateWorkflowParams<TInput, TOutput> = WorkflowDefinition<TInput, TOutput> & {
  runtime: AdlRuntime;
  /** Effective services (runtime + overrides). Set by `adl.createWorkflow`. */
  services?: RuntimeServices;
} & AdlRuntimeOverrides;

export function createWorkflow<TInput, TOutput>(
  params: CreateWorkflowParams<TInput, TOutput>,
): Workflow<TInput, TOutput> {
  const { id, runtime, services, run: runFn } = params;
  if (!id || typeof id !== "string") {
    throw new Error('createWorkflow: "id" must be a non-empty string');
  }

  const contextOverrides = pickContextOverrides(params);

  return {
    id,
    run(input: TInput): WorkflowRunHandle<TOutput> {
      void runtime;
      void services;
      void runFn;
      void input;
      void contextOverrides;
      // Implementation: const ctx = createWorkflowRunContext(runtime, contextOverrides);
      const error = new AdlNotImplementedError(`workflow.run (${id})`);
      return {
        workflowRunId: "",
        result: Promise.reject(error),
        cancel: () => {},
      };
    },
  };
}

function pickContextOverrides<TInput, TOutput>(
  params: CreateWorkflowParams<TInput, TOutput>,
): AdlRuntimeOverrides | undefined {
  const overrides: AdlRuntimeOverrides = {};
  if (params.messageStore !== undefined) {
    overrides.messageStore = params.messageStore;
  }
  if (params.workflowStore !== undefined) {
    overrides.workflowStore = params.workflowStore;
  }
  if (params.observers !== undefined) {
    overrides.observers = params.observers;
  }
  return Object.keys(overrides).length > 0 ? overrides : undefined;
}
