import { notImplemented } from "../internal/not-implemented";
import type { CreateWorkflowRunContextOptions, WorkflowRunContext } from "./types";
import type { LoadedAdlProject } from "../project/resolve";

export function createWorkflowRunContext(
  project: LoadedAdlProject,
  options?: CreateWorkflowRunContextOptions,
): WorkflowRunContext {
  void project;
  void options;
  notImplemented("createWorkflowRunContext");
}

/** @deprecated Use {@link createWorkflowRunContext}. */
export const createRunContext = createWorkflowRunContext;
