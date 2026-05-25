import type { AdlRuntime, AdlRuntimeOverrides } from "../runtime/types";
import { resolveRuntimeOverrides, splitFactoryParams } from "../runtime/resolve-overrides";
import { BoundWorkflow, type BoundWorkflowOptions } from "./bound-workflow";
import type { Workflow, WorkflowDefinition } from "./types";

/** Functional factory: workflow definition plus explicit {@link AdlRuntime}. */
export type CreateWorkflowParams<TInput, TOutput> = WorkflowDefinition<TInput, TOutput> & {
  runtime: AdlRuntime;
} & AdlRuntimeOverrides;

/** @internal Resolved binding (definition + effective services only). */
export type CreateWorkflowBoundParams<TInput, TOutput> = BoundWorkflowOptions<TInput, TOutput>;

export function createWorkflow<TInput, TOutput>(
  params: CreateWorkflowParams<TInput, TOutput>,
): Workflow<TInput, TOutput> {
  const { definition, runtime, overrides } = splitFactoryParams(params);
  const services = resolveRuntimeOverrides(runtime.services, overrides);
  return createWorkflowWithServices({ definition, services });
}

/** @internal Thin wrapper over {@link BoundWorkflow}. */
export function createWorkflowWithServices<TInput, TOutput>(
  params: CreateWorkflowBoundParams<TInput, TOutput>,
): BoundWorkflow<TInput, TOutput> {
  return new BoundWorkflow(params);
}
