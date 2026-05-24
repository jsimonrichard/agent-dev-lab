import type { AdlRuntimeOverrides } from "../../runtime/types";
import type { WorkflowContext } from "../types";

export type CreateWorkflowRunContextOptions = AdlRuntimeOverrides;

/** Root {@link WorkflowContext} for a workflow invocation (from `adl.createWorkflowRunContext()`). */
export type WorkflowRunContext = WorkflowContext;
