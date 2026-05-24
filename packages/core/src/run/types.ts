import type { AgentObservers, WorkflowObserver } from "../observability/observers";
import type { WorkflowStore } from "../observability/workflow-store";
import type { MessageStore } from "../memory/types";
import type { LoadedAdlProject } from "../project/resolve";
import type { WorkflowContext } from "../workflow/types";

export type CreateRunContextOptions = {
  workflowObservers?: WorkflowObserver[];
  agentObservers?: AgentObservers;
  workflowStore?: WorkflowStore;
  messageStore?: MessageStore;
  signal?: AbortSignal;
};

export type RunContext = WorkflowContext & {
  readonly project: LoadedAdlProject;
};
