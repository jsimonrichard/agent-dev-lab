import type { AdlRuntime, AdlRuntimeOverrides } from "../runtime/types.js";
import { resolveRuntimeOverrides } from "../runtime/resolve-overrides.js";
import { WorkflowImpl } from "./workflow-impl.js";
import type { Workflow, WorkflowDefinition } from "./types.js";

/**
 * Functional factory for tests and libraries. In project code, use {@link AdlRuntime.createWorkflow}.
 */
export function createWorkflow<TInput, TOutput>(
  runtime: AdlRuntime,
  definition: WorkflowDefinition<TInput, TOutput>,
  overrides?: AdlRuntimeOverrides,
): Workflow<TInput, TOutput> {
  const services = resolveRuntimeOverrides(runtime.services, overrides);
  return new WorkflowImpl(definition, services);
}
