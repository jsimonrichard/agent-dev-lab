import { createId } from "../../internal/ids";
import type { AdlRuntime } from "../../runtime/types";
import type { RuntimeServices } from "../../runtime/types";
import { buildWorkflowContext } from "../build-context";
import type { WorkflowRunContext } from "./types";

/**
 * Creates root run context for a workflow invocation.
 *
 * @internal Called by bound {@link Workflow.run} (and nested-run helpers), not by end users.
 */
export function createWorkflowRunContext(
  _runtime: AdlRuntime,
  services: RuntimeServices,
): WorkflowRunContext {
  const workflowRunId = createId();
  return buildWorkflowContext({
    workflowRunId,
    services,
    stepId: null,
    parentStepId: null,
    stepPath: [],
    registryParentKey: workflowRunId,
  });
}
