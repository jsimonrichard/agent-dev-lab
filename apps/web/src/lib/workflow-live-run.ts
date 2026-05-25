import type { RunEvent, Workflow, WorkflowStreamHandle } from "@agent-dev-lab/core";

/** @deprecated Use {@link Workflow.stream} from `@agent-dev-lab/core` directly. */
export type WorkflowLiveRunHandle<TOutput> = WorkflowStreamHandle<TOutput>;

/**
 * @deprecated Use `workflow.stream(input)` from `@agent-dev-lab/core`.
 * Kept as a thin alias for existing inspection-ui imports.
 */
export function startWorkflowRunWithEvents<TInput, TOutput>(
  workflow: Workflow<TInput, TOutput>,
  input: TInput,
): WorkflowStreamHandle<TOutput> {
  return workflow.stream(input);
}

export type { RunEvent };
