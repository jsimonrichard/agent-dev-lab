import type { RuntimeServices } from "../runtime/types";
import type { Workflow, WorkflowDefinition } from "./types";

export type WorkflowBinding<TInput = unknown, TOutput = unknown> = {
  definition: WorkflowDefinition<TInput, TOutput>;
  services: RuntimeServices;
};

const bindings = new WeakMap<object, WorkflowBinding>();

export function bindWorkflow<TInput, TOutput>(
  workflow: Workflow<TInput, TOutput>,
  binding: WorkflowBinding<TInput, TOutput>,
): void {
  bindings.set(workflow, binding as WorkflowBinding);
}

export function getWorkflowBinding<TInput, TOutput>(
  workflow: Workflow<TInput, TOutput>,
): WorkflowBinding<TInput, TOutput> | undefined {
  return bindings.get(workflow) as WorkflowBinding<TInput, TOutput> | undefined;
}
