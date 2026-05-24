import type { AdlRuntime } from "../../runtime/types";
import { notImplemented } from "../../internal/not-implemented";
import type { CreateWorkflowRunContextOptions, WorkflowRunContext } from "./types";

/** @see AdlRuntime.createWorkflowRunContext — preferred entrypoint. */
export function createWorkflowRunContext(
  runtime: AdlRuntime,
  options?: CreateWorkflowRunContextOptions,
): WorkflowRunContext {
  void runtime;
  void options;
  notImplemented("createWorkflowRunContext");
}
