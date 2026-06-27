import type { AdlRuntime, AdlRuntimeOverrides } from "../runtime/types";
import { resolveRuntimeOverrides } from "../runtime/resolve-overrides";
import { WorkflowImpl } from "./workflow-impl";
import type { Workflow, WorkflowDefinition } from "./types";

export function createWorkflow<TInput, TOutput>(
  runtime: AdlRuntime,
  definition: WorkflowDefinition<TInput, TOutput>,
  overrides?: AdlRuntimeOverrides,
): Workflow<TInput, TOutput> {
  const services = resolveRuntimeOverrides(runtime.services, overrides);
  return new WorkflowImpl(definition, services);
}
