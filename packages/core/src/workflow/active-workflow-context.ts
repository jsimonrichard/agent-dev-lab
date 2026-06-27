import { AsyncLocalStorage } from "node:async_hooks";

import type { WorkflowContextImpl } from "./context.js";
import type { WorkflowContext } from "./types.js";

/**
 * Step- or workflow-body-local binding so {@link peekWorkflowContext} can resolve the
 * current frame for agent.run and workflow tools. Not a stack: each scope sets one context
 * for immediate children on the same async chain.
 */
const activeWorkflowContext = new AsyncLocalStorage<WorkflowContextImpl>();

export function runWithActiveWorkflowContext<T>(
  ctx: WorkflowContextImpl,
  fn: () => Promise<T>,
): Promise<T> {
  return activeWorkflowContext.run(ctx, fn);
}

export function peekWorkflowContext(): WorkflowContext | undefined {
  return activeWorkflowContext.getStore();
}
