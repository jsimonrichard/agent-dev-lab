import type { AdlRuntime, AdlRuntimeOverrides } from "../runtime/types";
import { resolveRuntimeOverrides } from "../runtime/resolve-overrides";
import { WorkflowImpl } from "./workflow-impl";
import type { Workflow, WorkflowDefinition } from "./types";

/**
 * Functional factory for tests and libraries. In project code, use {@link AdlRuntime.createWorkflow}.
 */
export function createWorkflow<TInput, TOutput, TRawInput = TInput>(
  runtime: AdlRuntime,
  definition: WorkflowDefinition<TInput, TOutput, TRawInput>,
  overrides?: AdlRuntimeOverrides,
): Workflow<TInput, TOutput, TRawInput> {
  const services = resolveRuntimeOverrides(runtime.services, overrides);
  return new WorkflowImpl(definition, services);
}
