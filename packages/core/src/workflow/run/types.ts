import type { AdlRuntimeOverrides } from "../../runtime/types";
import type { WorkflowContext } from "../types";

export type CreateWorkflowRunContextOptions = AdlRuntimeOverrides;

/** Root workflow context (package-internal; authors see {@link WorkflowContext} in `run`). */
export type WorkflowRunContext = WorkflowContext;
