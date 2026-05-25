import { createId } from "../internal/ids";
import type { RuntimeServices } from "../runtime/types";
import { executeWorkflowRunWithCancel } from "./execute-run";
import { WorkflowRunEventChannel } from "./run-event-channel";
import type {
  Workflow,
  WorkflowDefinition,
  WorkflowRunHandle,
  WorkflowStreamHandle,
} from "./types";

/**
 * Default workflow implementation: definition plus resolved runtime services.
 */
export class WorkflowImpl<TInput, TOutput> implements Workflow<TInput, TOutput> {
  readonly id: string;

  constructor(
    readonly definition: WorkflowDefinition<TInput, TOutput>,
    readonly services: RuntimeServices,
  ) {
    if (!definition.id || typeof definition.id !== "string") {
      throw new Error('WorkflowImpl: "id" must be a non-empty string');
    }
    this.id = definition.id;
  }

  run(input: TInput): WorkflowRunHandle<TOutput> {
    const handle = executeWorkflowRunWithCancel(this.definition, input, this.services);
    return {
      workflowRunId: handle.workflowRunId,
      result: handle.result,
      cancel: handle.cancel,
    };
  }

  stream(input: TInput): WorkflowStreamHandle<TOutput> {
    const workflowRunId = createId();
    const channel = new WorkflowRunEventChannel(workflowRunId);
    const handle = executeWorkflowRunWithCancel(this.definition, input, this.services, {
      workflowRunId,
      extraObservers: {
        workflows: [channel.asWorkflowObserver()],
        agents: [channel.asAgentObserver()],
      },
    });
    const result = handle.result.finally(() => channel.close());
    return {
      workflowRunId: handle.workflowRunId,
      events: channel.stream(),
      result,
      cancel: handle.cancel,
    };
  }
}
