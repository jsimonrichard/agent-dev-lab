import { notImplemented } from "../../internal/not-implemented";
import type { LoadedAdlProject } from "../../project/resolve";
import type { CreateWorkflowRunContextOptions, WorkflowRunContext } from "./types";

export function createWorkflowRunContext(
  project: LoadedAdlProject,
  options?: CreateWorkflowRunContextOptions,
): WorkflowRunContext {
  void project;
  void options;
  notImplemented("createWorkflowRunContext");
}
