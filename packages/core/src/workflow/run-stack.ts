import type { WorkflowContext } from "./types";

/**
 * Synchronous stack for the active workflow context during a run (tools, nested steps).
 * Not AsyncLocalStorage — only valid while workflow/step closures execute on the same stack.
 *
 * @internal
 */
const stack: WorkflowContext[] = [];

export function enterWorkflowContext(ctx: WorkflowContext): void {
  stack.push(ctx);
}

export function exitWorkflowContext(): void {
  stack.pop();
}

export function peekWorkflowContext(): WorkflowContext | undefined {
  return stack.at(-1);
}
