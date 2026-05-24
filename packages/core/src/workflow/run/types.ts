import type { AgentObservers, WorkflowObserver } from "../../observability/observers";
import type { WorkflowStore } from "../../observability/workflow-store";
import type { MessageStore } from "../../memory/types";
import type { LoadedAdlProject } from "../../project/resolve";
import type { WorkflowContext } from "../types";

export type CreateWorkflowRunContextOptions = {
  workflowObservers?: WorkflowObserver[];
  agentObservers?: AgentObservers;
  workflowStore?: WorkflowStore;
  messageStore?: MessageStore;
};

/** Root {@link WorkflowContext} for a workflow invocation, including project defaults. */
export type WorkflowRunContext = WorkflowContext & {
  readonly project: LoadedAdlProject;
};

/** @deprecated Use {@link CreateWorkflowRunContextOptions}. */
export type CreateRunContextOptions = CreateWorkflowRunContextOptions;

/** @deprecated Use {@link WorkflowRunContext}. */
export type RunContext = WorkflowRunContext;
