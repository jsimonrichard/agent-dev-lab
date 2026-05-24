import { AdlNotImplementedError } from "../internal/not-implemented";
import type { Workflow, WorkflowDefinition, WorkflowRunHandle } from "./types";

export function createWorkflow<TInput, TOutput>(
  config: WorkflowDefinition<TInput, TOutput>,
): Workflow<TInput, TOutput> {
  const id = config.id;
  if (!id || typeof id !== "string") {
    throw new Error('createWorkflow: "id" must be a non-empty string');
  }

  return {
    id,
    run(): WorkflowRunHandle<TOutput> {
      const error = new AdlNotImplementedError(`workflow.run (${id})`);
      return {
        result: Promise.reject(error),
        cancel: () => {},
      };
    },
  };
}
