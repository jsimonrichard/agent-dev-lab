import { createId } from "../../internal/ids";
import type { AdlRuntime } from "../../runtime/types";
import type { RuntimeServices } from "../../runtime/types";
import { createWorkflowContext } from "../context";
import { WorkflowRunStack } from "../workflow-run-stack";
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
  return createWorkflowContext({
    workflowRunId,
    services,
    stepId: null,
    parentStepId: null,
    stepPath: [],
    registryParentKey: workflowRunId,
    runStack: new WorkflowRunStack(),
  });
}
