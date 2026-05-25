import type { AdlRuntime } from "../../runtime/types";
import { notImplemented } from "../../internal/not-implemented";
import type { CreateWorkflowRunContextOptions, WorkflowRunContext } from "./types";

/**
 * Creates root run context for a workflow invocation.
 *
 * @internal Called by bound {@link Workflow.run} (and nested-run helpers), not by end users.
 */
export function createWorkflowRunContext(
  runtime: AdlRuntime,
  options?: CreateWorkflowRunContextOptions,
): WorkflowRunContext {
  void runtime;
  void options;
  notImplemented("createWorkflowRunContext");
}
