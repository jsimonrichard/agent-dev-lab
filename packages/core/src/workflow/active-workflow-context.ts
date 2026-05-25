import { AsyncLocalStorage } from "node:async_hooks";

import type { RunRecorder } from "../runtime/run-recorder";
import type { WorkflowContextImpl } from "./context";
import type { WorkflowContext } from "./types";

/**
 * Step- or workflow-body-local binding so {@link peekWorkflowContext} can resolve the
 * current frame for agent.run and workflow tools. Not a stack: each scope sets one context
 * for immediate children on the same async chain.
 *
 * ALS is used only during step and workflow bodies — not for runtime services wiring.
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

/** Returns the workflow's RunRecorder when an agent runs inside a workflow/step. */
export function peekRunRecorder(): RunRecorder | undefined {
  return activeWorkflowContext.getStore()?.runRecorder;
}
