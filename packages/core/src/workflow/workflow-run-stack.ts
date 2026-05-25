import { AsyncLocalStorage } from "node:async_hooks";

import type { WorkflowContext } from "./types";
import type { WorkflowContextImpl } from "./context";

/**
 * Per-workflow-run stack of active {@link WorkflowContextImpl} frames.
 * Threaded through context instances (not a module-level array) so concurrent runs stay isolated.
 */
export class WorkflowRunStack {
  private readonly frames: WorkflowContextImpl[] = [];

  push(ctx: WorkflowContextImpl): void {
    this.frames.push(ctx);
  }

  pop(): void {
    this.frames.pop();
  }

  peek(): WorkflowContextImpl | undefined {
    return this.frames.at(-1);
  }
}

const activeRunStack = new AsyncLocalStorage<WorkflowRunStack>();

/** Binds a run stack to the current async execution chain (supports concurrent workflow runs). */
export function runWithWorkflowRunStack<T>(
  runStack: WorkflowRunStack,
  fn: () => Promise<T>,
): Promise<T> {
  return activeRunStack.run(runStack, fn);
}

/** @internal Active workflow context for the current async chain, if any. */
export function peekWorkflowContext(): WorkflowContext | undefined {
  return activeRunStack.getStore()?.peek();
}
