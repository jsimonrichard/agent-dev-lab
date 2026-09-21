import type { z } from "zod";

import { AdlError } from "../errors";
import { abortError, linkAbortController, raceAbort, throwIfAborted } from "../internal/abort";
import { createId } from "../internal/ids";
import { serializeError } from "../internal/serialize-error";
import { withProjectVersionTag } from "../project/version-tag";
import { RunRecorder, withActiveSpan } from "../runtime/run-recorder";
import type { RuntimeServices } from "../runtime/types";
import { createWorkflowContext } from "./context";
import type { WorkflowContextImpl } from "./context";
import { resolveAttemptChildRunId } from "./retry-attempt";
import { WorkflowRunEventChannel } from "./workflow-run-event-channel";
import type {
  Workflow,
  WorkflowContext,
  WorkflowDefinition,
  WorkflowRunHandle,
  WorkflowRunStartOptions,
  WorkflowStreamHandle,
} from "./types";

/**
 * Default workflow implementation: definition plus resolved runtime services.
 * Execution logic lives on this class (parallel to {@link AgentImpl}).
 */
export class WorkflowImpl<TInput, TOutput, TRawInput = TInput> implements Workflow<
  TInput,
  TOutput,
  TRawInput
> {
  readonly id: string;

  constructor(
    readonly definition: WorkflowDefinition<TInput, TOutput, TRawInput>,
    readonly services: RuntimeServices,
  ) {
    if (!definition.id || typeof definition.id !== "string") {
      throw new Error('WorkflowImpl: "id" must be a non-empty string');
    }
    this.id = definition.id;
  }

  get inputSchema(): z.ZodType<TInput, TRawInput> | undefined {
    return this.definition.inputSchema;
  }

  run(input: TRawInput, options?: WorkflowRunStartOptions): WorkflowRunHandle<TOutput> {
    const handle = this.startRunWithCancel(input, options);
    return {
      workflowRunId: handle.workflowRunId,
      result: handle.result,
      cancel: handle.cancel,
    };
  }

  stream(input: TRawInput): WorkflowStreamHandle<TOutput> {
    const workflowRunId = createId();
    const channel = new WorkflowRunEventChannel(workflowRunId);
    const handle = this.startRunWithCancel(input, {
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

  #executeRun(
    input: TRawInput,
    options?: WorkflowRunStartOptions,
    abortController?: AbortController,
  ): Promise<TOutput> {
    const parentCtx = resolveParentContext(this.services, options);
    const retryAttempt =
      options?.retryAttempt ??
      (parentCtx ? (parentCtx as WorkflowContextImpl).retryAttempt : undefined);

    let workflowRunId = options?.workflowRunId;
    if (!workflowRunId && parentCtx && retryAttempt) {
      workflowRunId = resolveAttemptChildRunId(retryAttempt, {
        parentWorkflowRunId: parentCtx.workflowRunId,
        parentStepId: parentCtx.stepId,
        parentStepPath: parentCtx.stepPath,
        workflowId: this.definition.id,
      });
    }
    workflowRunId = workflowRunId ?? createId();

    const parentWorkflowRunId = parentCtx?.workflowRunId ?? null;
    const parentStepId = parentCtx?.stepId ?? null;

    let parsedInput = input as unknown as TInput;
    if (this.definition.inputSchema) {
      try {
        parsedInput = this.definition.inputSchema.parse(input);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new AdlError("INVALID_INPUT", `Invalid input for workflow "${this.id}": ${detail}`, {
          cause: error,
        });
      }
    }
    const controller = abortController ?? new AbortController();

    const effectiveServices = servicesForRun(this.services, options);
    const runRecorder = new RunRecorder(effectiveServices);

    const rootCtx = createWorkflowContext({
      workflowRunId,
      parentWorkflowRunId,
      services: effectiveServices,
      stepId: null,
      parentStepId: null,
      stepPath: [],
      registryParentKey: workflowRunId,
      runRecorder,
      signal: controller.signal,
      retryAttempt,
    });

    return withActiveSpan(
      "workflow.run",
      {
        "adl.workflow_run_id": workflowRunId,
        "adl.workflow_id": this.definition.id,
      },
      async () => {
        const store = effectiveServices.stores.workflow;
        // Successful fully-replayed nested child: return seeded output without re-running.
        // Error/cancelled copies keep their status but must re-execute if re-entered.
        if (retryAttempt && parentCtx && store) {
          const existing = await store.getRun(workflowRunId);
          if (existing?.replayOfRunId && existing.status === "ok") {
            const output = await store.getRunOutput(workflowRunId);
            return (
              this.definition.outputSchema ? this.definition.outputSchema.parse(output) : output
            ) as TOutput;
          }
        }

        await runRecorder.emit({
          type: "workflow_started",
          workflowRunId,
          workflowId: this.definition.id,
          input: parsedInput,
          tags: withProjectVersionTag(options?.tags, effectiveServices.version),
          parentWorkflowRunId,
          parentStepId: parentCtx ? parentStepId : undefined,
          ...(retryAttempt && !parentCtx
            ? {
                retriesFromRunId: retryAttempt.retriesFromRunId,
              }
            : {}),
        });

        try {
          throwIfAborted(controller.signal);
          const output = await effectiveServices.workflowContextScope.run(rootCtx, () =>
            raceAbort(controller.signal, this.definition.run(parsedInput, rootCtx)),
          );
          const parsedOutput = this.definition.outputSchema
            ? this.definition.outputSchema.parse(output)
            : output;

          if (controller.signal.aborted) {
            await runRecorder.emit({
              type: "workflow_cancelled",
              workflowRunId,
            });
            throw abortError(controller.signal);
          }

          await runRecorder.emit({
            type: "workflow_finished",
            workflowRunId,
            output: parsedOutput,
          });

          return parsedOutput;
        } catch (error) {
          if (controller.signal.aborted) {
            await runRecorder.emit({
              type: "workflow_cancelled",
              workflowRunId,
            });
          } else {
            await runRecorder.emit({
              type: "workflow_failed",
              workflowRunId,
              error: serializeError(error),
            });
          }
          throw error;
        }
      },
    );
  }

  private startRunWithCancel(
    input: TRawInput,
    options?: WorkflowRunStartOptions,
  ): { workflowRunId: string; result: Promise<TOutput>; cancel: () => void } {
    const parentCtx = resolveParentContext(this.services, options);
    const retryAttempt =
      options?.retryAttempt ??
      (parentCtx ? (parentCtx as WorkflowContextImpl).retryAttempt : undefined);

    let workflowRunId = options?.workflowRunId;
    if (!workflowRunId && parentCtx && retryAttempt) {
      workflowRunId = resolveAttemptChildRunId(retryAttempt, {
        parentWorkflowRunId: parentCtx.workflowRunId,
        parentStepId: parentCtx.stepId,
        parentStepPath: parentCtx.stepPath,
        workflowId: this.definition.id,
      });
    }
    workflowRunId = workflowRunId ?? createId();

    const abortController = linkAbortController(parentCtx?.signal);
    return {
      workflowRunId,
      result: this.#executeRun(input, { ...options, workflowRunId, retryAttempt }, abortController),
      cancel: () => abortController.abort(),
    };
  }
}

function resolveParentContext(
  services: RuntimeServices,
  options?: WorkflowRunStartOptions,
): WorkflowContext | undefined {
  if (options?.isolated) {
    return undefined;
  }
  return options?.parentCtx ?? services.workflowContextScope.peek();
}

function servicesForRun(
  services: RuntimeServices,
  options?: WorkflowRunStartOptions,
): RuntimeServices {
  return mergeServicesForRun(services, options?.extraObservers);
}

function mergeServicesForRun(
  services: RuntimeServices,
  extra?: WorkflowRunStartOptions["extraObservers"],
): RuntimeServices {
  if (!extra) {
    return services;
  }
  return {
    ...services,
    observers: {
      workflows: [...services.observers.workflows, ...(extra.workflows ?? [])],
      agents: [...services.observers.agents, ...(extra.agents ?? [])],
    },
  };
}
