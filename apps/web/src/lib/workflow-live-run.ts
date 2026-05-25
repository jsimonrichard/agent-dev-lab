import type {
  RunEvent,
  Workflow,
  WorkflowRunHandle,
  WorkflowRunStartOptions,
} from "@agent-dev-lab/core";

import { WorkflowRunEventChannel } from "./workflow-run-event-channel";

export type WorkflowLiveRunHandle<TOutput> = WorkflowRunHandle<TOutput> & {
  events: AsyncIterable<RunEvent>;
};

/**
 * Starts {@link Workflow.run} with in-process observers that buffer run events for
 * {@link WorkflowLiveRunHandle.events}. Prefer store + SSE for production UI.
 */
export function startWorkflowRunWithEvents<TInput, TOutput>(
  workflow: Workflow<TInput, TOutput>,
  input: TInput,
  options?: Omit<WorkflowRunStartOptions, "extraObservers">,
): WorkflowLiveRunHandle<TOutput> {
  const workflowRunId = options?.workflowRunId ?? crypto.randomUUID();
  const channel = new WorkflowRunEventChannel(workflowRunId);
  const handle = workflow.run(input, {
    ...options,
    workflowRunId,
    extraObservers: {
      workflows: [channel.asWorkflowObserver()],
      agents: [channel.asAgentObserver()],
    },
  });
  const result = handle.result.finally(() => channel.close());
  return {
    workflowRunId: handle.workflowRunId,
    result,
    cancel: handle.cancel,
    events: channel.stream(),
  };
}
