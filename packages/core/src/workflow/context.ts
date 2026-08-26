import { createId } from "../internal/ids";
import { serializeError } from "../internal/serialize-error";
import { RunRecorder, withActiveSpan } from "../runtime/run-recorder";
import type { RuntimeServices } from "../runtime/types";
import { formatStepPathSegment, StepRegistry } from "./step-registry";
import type { CustomWorkflowEvent, StepOptions, WorkflowContext } from "./types";

export type WorkflowContextOptions = {
  workflowRunId: string;
  services: RuntimeServices;
  stepId: string | null;
  parentStepId: string | null;
  stepPath: string[];
  registryParentKey: string;
  runRecorder: RunRecorder;
};

export class WorkflowContextImpl implements WorkflowContext {
  readonly workflowRunId: string;
  readonly stepId: string | null;
  readonly stepPath: string[];
  readonly parentStepId: string | null;
  readonly runRecorder: RunRecorder;

  readonly services: RuntimeServices;

  private readonly registry: StepRegistry;
  private readonly registryParentKey: string;

  constructor(options: WorkflowContextOptions) {
    this.workflowRunId = options.workflowRunId;
    this.services = options.services;
    this.stepId = options.stepId;
    this.parentStepId = options.parentStepId;
    this.stepPath = [...options.stepPath];
    this.registryParentKey = options.registryParentKey;
    this.runRecorder = options.runRecorder;
    this.registry = new StepRegistry(this.registryParentKey);
  }

  memoryScopeWithSuffix = (suffix: string): string => `${this.workflowRunId}:${suffix}`;

  emit = (event: CustomWorkflowEvent): void => {
    void this.runRecorder.emit({
      type: "custom",
      workflowRunId: this.workflowRunId,
      stepId: this.stepId,
      name: event.name,
      payload: event.payload,
    });
  };

  setTitle = async (title: string): Promise<void> => {
    const trimmed = title.trim();
    if (!trimmed) {
      return;
    }
    await this.services.stores.workflow?.setRunTitle(this.workflowRunId, trimmed);
    await this.runRecorder.emit({
      type: "workflow_title_set",
      workflowRunId: this.workflowRunId,
      stepId: this.stepId,
      title: trimmed,
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
        const skippedPath = [...this.stepPath, formatStepPathSegment(name, key)];
        await this.runRecorder.emit({
          type: "step_skipped",
          workflowRunId: this.workflowRunId,
          stepId: skippedStepId,
          parentStepId: parentId,
          name,
          key,
          path: skippedPath,
          output: cached,
        });
        return cached as T;
      }
    }

    const stepId = createId();
    const pathSegment = formatStepPathSegment(name, key);
    const path = [...this.stepPath, pathSegment];
    const startedAt = Date.now();

    await this.runRecorder.emit({
      type: "step_started",
      workflowRunId: this.workflowRunId,
      stepId,
      parentStepId: parentId,
      name,
      key,
      path,
    });

    const childCtx = createChildWorkflowContext(this, {
      stepId,
      parentStepId: parentId,
      stepPath: path,
    });

    try {
      const output = await withActiveSpan(
        "workflow.step",
        {
          "adl.workflow_run_id": this.workflowRunId,
          "adl.step_id": stepId,
          "adl.step.name": name,
        },
        () => this.services.workflowContextScope.run(childCtx, () => fn({ ctx: childCtx })),
      );
      const durationMs = Date.now() - startedAt;
      await this.runRecorder.emit({
        type: "step_finished",
        workflowRunId: this.workflowRunId,
        stepId,
        parentStepId: parentId,
        name,
        key,
        path,
        status: "ok",
        durationMs,
        output,
      });
      return output;
    } catch (error) {
      await this.runRecorder.emit({
        type: "step_failed",
        workflowRunId: this.workflowRunId,
        stepId,
        parentStepId: parentId,
        name,
        key,
        path,
        error: serializeError(error),
      });
      throw error;
    }
  };
}

/** Builds a step context from its parent (functional; no shared stack). */
export function createChildWorkflowContext(
  parent: WorkflowContextImpl,
  step: {
    stepId: string;
    parentStepId: string | null;
    stepPath: string[];
  },
): WorkflowContextImpl {
  return new WorkflowContextImpl({
    workflowRunId: parent.workflowRunId,
    services: parent.services,
    stepId: step.stepId,
    parentStepId: step.parentStepId,
    stepPath: step.stepPath,
    registryParentKey: `${parent.workflowRunId}|${step.stepId}`,
    runRecorder: parent.runRecorder,
  });
}

function asWorkflowContextImpl(ctx: WorkflowContext): WorkflowContextImpl {
  return ctx as WorkflowContextImpl;
}

export function refreshWorkflowContext(
  ctx: WorkflowContext,
  services: RuntimeServices,
  runRecorder: RunRecorder,
): WorkflowContextImpl {
  const impl = asWorkflowContextImpl(ctx);
  return new WorkflowContextImpl({
    workflowRunId: impl.workflowRunId,
    services,
    stepId: impl.stepId,
    parentStepId: impl.parentStepId,
    stepPath: impl.stepPath,
    registryParentKey: impl.stepId ?? impl.workflowRunId,
    runRecorder,
  });
}

export function createWorkflowContext(options: WorkflowContextOptions): WorkflowContextImpl {
  return new WorkflowContextImpl(options);
}
