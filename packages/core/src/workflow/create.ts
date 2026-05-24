import { notImplemented } from "../internal/not-implemented";
import type { Workflow, WorkflowDefinition } from "./types";

export function createWorkflow<TInput, TOutput>(
  config: WorkflowDefinition<TInput, TOutput>,
): Workflow<TInput, TOutput> {
  const id = config.id;
  if (!id || typeof id !== "string") {
    throw new Error('createWorkflow: "id" must be a non-empty string');
  }

  return {
    id,
    run() {
      notImplemented(`workflow.run (${id})`);
    },
  };
}
