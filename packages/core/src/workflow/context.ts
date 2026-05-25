import { createId } from "../internal/ids";
import { EventLog } from "../runtime/event-log";
import type { RuntimeServices } from "../runtime/types";
import { enterWorkflowContext, exitWorkflowContext } from "./run-stack";
import { formatStepPathSegment, StepRegistry } from "./step-registry";
import type { CustomWorkflowEvent, StepOptions, WorkflowContext } from "./types";

export type WorkflowContextOptions = {
  workflowRunId: string;
  services: RuntimeServices;
  stepId: string | null;
  parentStepId: string | null;
  stepPath: string[];
  registryParentKey: string;
};

/** Stateful workflow execution host (implements {@link WorkflowContext}). */
export class WorkflowContextImpl implements WorkflowContext {
  readonly workflowRunId: string;
  readonly stepId: string | null;
  readonly stepPath: string[];
  readonly parentStepId: string | null;

  private readonly services: RuntimeServices;
  private readonly registry: StepRegistry;
  private readonly eventLog: EventLog;
  private readonly registryParentKey: string;

  constructor(options: WorkflowContextOptions) {
    this.workflowRunId = options.workflowRunId;
    this.services = options.services;
    this.stepId = options.stepId;
    this.parentStepId = options.parentStepId;
    this.stepPath = [...options.stepPath];
    this.registryParentKey = options.registryParentKey;
    this.registry = new StepRegistry(this.registryParentKey);
    this.eventLog = new EventLog(this.services, { workflowRunId: this.workflowRunId });
  }

  memoryScope = (suffix: string): string => `${this.workflowRunId}:${suffix}`;

  emit = (event: CustomWorkflowEvent): void => {
    void this.eventLog.emit({
      type: "custom",
      workflowRunId: this.workflowRunId,
      stepId: this.stepId,
      name: event.name,
      payload: event.payload,
      seq: 0,
      at: "",
    });
  };

  step = async <T>(
    name: string,
    fn: (args: { ctx: WorkflowContext }) => Promise<T>,
    options?: StepOptions,
  ): Promise<T> => {
    const parentId = this.stepId;
    const key = options?.key;
    this.registry.register(name, key, options?.allowDuplicateName);

    const store = this.services.stores.workflow;
    if (store && !options?.force) {
      const cached = await store.getStepOutput(this.workflowRunId, {
        parentStepId: parentId,
        name,
        key,
      });
      if (cached !== null) {
        const skippedStepId = createId();
        await this.eventLog.emit({
          type: "step_skipped",
          workflowRunId: this.workflowRunId,
          stepId: skippedStepId,
          name,
          key,
          output: cached,
          seq: 0,
          at: "",
        });
        return cached as T;
      }
    }

    const stepId = createId();
    const pathSegment = formatStepPathSegment(name, key);
    const path = [...this.stepPath, pathSegment];
    const startedAt = Date.now();

    await this.eventLog.emit({
      type: "step_started",
      workflowRunId: this.workflowRunId,
      stepId,
      parentStepId: parentId,
      name,
      key,
      path,
      seq: 0,
      at: "",
    });

    const childCtx = new WorkflowContextImpl({
      workflowRunId: this.workflowRunId,
      services: this.services,
      stepId,
      parentStepId: parentId,
      stepPath: path,
      registryParentKey: `${this.workflowRunId}|${stepId}`,
    });

    enterWorkflowContext(childCtx);
    try {
      const output = await fn({ ctx: childCtx });
      const durationMs = Date.now() - startedAt;
      await this.eventLog.emit({
        type: "step_finished",
        workflowRunId: this.workflowRunId,
        stepId,
        status: "ok",
        durationMs,
        output,
        seq: 0,
        at: "",
      });
      return output;
    } catch (error) {
      await this.eventLog.emit({
        type: "step_failed",
        workflowRunId: this.workflowRunId,
        stepId,
        error: serializeError(error),
        seq: 0,
        at: "",
      });
      throw error;
    } finally {
      exitWorkflowContext();
    }
  };
}

export function refreshWorkflowContext(
  ctx: WorkflowContext,
  services: RuntimeServices,
): WorkflowContextImpl {
  return new WorkflowContextImpl({
    workflowRunId: ctx.workflowRunId,
    services,
    stepId: ctx.stepId,
    parentStepId: ctx.parentStepId,
    stepPath: ctx.stepPath,
    registryParentKey: ctx.stepId ?? ctx.workflowRunId,
  });
}

export function createWorkflowContext(options: WorkflowContextOptions): WorkflowContextImpl {
  return new WorkflowContextImpl(options);
}

function serializeError(error: unknown): unknown {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return error;
}
