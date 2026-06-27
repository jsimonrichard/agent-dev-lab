import type { AdlRuntime, AdlRuntimeOverrides } from "../runtime/types.js";
import { resolveRuntimeOverrides, splitFactoryParams } from "../runtime/resolve-overrides.js";
import { WorkflowImpl } from "./workflow-impl.js";
import type { Workflow, WorkflowDefinition } from "./types.js";

/** Functional factory: workflow definition plus explicit {@link AdlRuntime}. */
export type CreateWorkflowParams<TInput, TOutput> = WorkflowDefinition<TInput, TOutput> & {
  runtime: AdlRuntime;
} & AdlRuntimeOverrides;

export function createWorkflow<TInput, TOutput>(
  params: CreateWorkflowParams<TInput, TOutput>,
): Workflow<TInput, TOutput> {
  const { definition, runtime, overrides } = splitFactoryParams(params);
  const services = resolveRuntimeOverrides(runtime.services, overrides);
  return new WorkflowImpl(definition, services);
}
