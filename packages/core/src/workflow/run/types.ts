import type { RuntimeServices } from "../../runtime/types";
import type { WorkflowContext } from "../types";

/** Root workflow context (package-internal; authors see {@link WorkflowContext} in `run`). */
export type WorkflowRunContext = WorkflowContext;

/** Effective services for a workflow invocation (merged runtime + per-workflow overrides). */
export type CreateWorkflowRunContextOptions = RuntimeServices;
