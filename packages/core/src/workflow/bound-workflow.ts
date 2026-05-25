import type { RuntimeServices } from "../runtime/types";
import { executeWorkflowRunWithCancel } from "./execute-run";
import type { Workflow, WorkflowDefinition, WorkflowRunHandle } from "./types";

export type BoundWorkflowOptions<TInput, TOutput> = {
  definition: WorkflowDefinition<TInput, TOutput>;
  services: RuntimeServices;
};

/**
 * Workflow bound to resolved runtime services (definition + effective stores/observers).
 */
export class BoundWorkflow<TInput, TOutput> implements Workflow<TInput, TOutput> {
  readonly id: string;

  constructor(private readonly options: BoundWorkflowOptions<TInput, TOutput>) {
    if (!options.definition.id || typeof options.definition.id !== "string") {
      throw new Error('BoundWorkflow: "id" must be a non-empty string');
    }
    this.id = options.definition.id;
  }

  get definition(): WorkflowDefinition<TInput, TOutput> {
    return this.options.definition;
  }

  get services(): RuntimeServices {
    return this.options.services;
  }

  run(input: TInput): WorkflowRunHandle<TOutput> {
    const handle = executeWorkflowRunWithCancel(
      this.options.definition,
      input,
      this.options.services,
    );
    return {
      workflowRunId: handle.workflowRunId,
      result: handle.result,
      cancel: handle.cancel,
    };
  }
}
