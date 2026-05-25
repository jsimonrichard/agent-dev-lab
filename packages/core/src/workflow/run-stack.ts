import type { WorkflowContext } from "./types";
import { WorkflowContextImpl } from "./context";

/** @internal Active workflow context during nested steps and tool execution. */
export function peekWorkflowContext(): WorkflowContext | undefined {
  return WorkflowContextImpl.peekActive();
}

/** @internal @deprecated Use {@link WorkflowContextImpl.pushActive}. */
export function enterWorkflowContext(ctx: WorkflowContext): void {
  WorkflowContextImpl.pushActive(ctx as WorkflowContextImpl);
}

/** @internal @deprecated Use {@link WorkflowContextImpl.popActive}. */
export function exitWorkflowContext(): void {
  WorkflowContextImpl.popActive();
}
