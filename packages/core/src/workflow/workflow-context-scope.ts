import { AsyncLocalStorage } from "node:async_hooks";

import type { RunRecorder } from "../runtime/run-recorder";
import type { WorkflowContextImpl } from "./context";
import type { WorkflowContext } from "./types";

/**
 * Per-runtime AsyncLocalStorage for the active workflow context.
 * Owned by {@link RuntimeServices} — one instance per {@link createAdlRuntime} call.
 *
 * Step- or workflow-body-local binding so {@link WorkflowContextScope#peek} can resolve the
 * current frame for agent.run and workflow tools. Not a stack: each scope sets one context
 * for immediate children on the same async chain.
 *
 * ALS is used only during step and workflow bodies — not for runtime services wiring.
 */
export class WorkflowContextScope {
  private readonly storage = new AsyncLocalStorage<WorkflowContextImpl>();

  run<T>(ctx: WorkflowContextImpl, fn: () => Promise<T>): Promise<T> {
    return this.storage.run(ctx, fn);
  }

  peek(): WorkflowContext | undefined {
    return this.storage.getStore();
  }

  /** Returns the workflow's RunRecorder when an agent runs inside a workflow/step. */
  peekRunRecorder(): RunRecorder | undefined {
    return this.storage.getStore()?.runRecorder;
  }
}
