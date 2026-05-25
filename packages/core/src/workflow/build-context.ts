import { createId } from "../internal/ids";
import { EventLog } from "../runtime/event-log";
import type { RuntimeServices } from "../runtime/types";
import { enterWorkflowContext, exitWorkflowContext } from "./run-stack";
import { formatStepPathSegment, StepRegistry } from "./step-registry";
import type { CustomWorkflowEvent, StepFn, StepOptions, WorkflowContext } from "./types";

export type BuildWorkflowContextOptions = {
  workflowRunId: string;
  services: RuntimeServices;
  stepId: string | null;
  parentStepId: string | null;
  stepPath: string[];
  registryParentKey: string;
};

/** Rebuilds step registry while preserving run identity (for resume / re-run). */
export function refreshWorkflowContext(
  ctx: WorkflowContext,
  services: RuntimeServices,
): WorkflowContext {
  return buildWorkflowContext({
    workflowRunId: ctx.workflowRunId,
    services,
    stepId: ctx.stepId,
    parentStepId: ctx.parentStepId,
    stepPath: ctx.stepPath,
    registryParentKey: ctx.stepId ?? ctx.workflowRunId,
  });
}

export function buildWorkflowContext(options: BuildWorkflowContextOptions): WorkflowContext {
  const { workflowRunId, services, stepId, parentStepId, stepPath, registryParentKey } = options;
  const registry = new StepRegistry(registryParentKey);
  const eventLog = new EventLog(services, { workflowRunId });

  const ctx: WorkflowContext = {
    workflowRunId,
    stepId,
    stepPath: [...stepPath],
    parentStepId,
    memoryScope: (suffix: string) => `${workflowRunId}:${suffix}`,
    emit(event: CustomWorkflowEvent) {
      void eventLog.emit({
        type: "custom",
        workflowRunId,
        stepId,
        name: event.name,
        payload: event.payload,
        seq: 0,
        at: "",
      });
    },
    step: createStepFn({
      workflowRunId,
      services,
      parentStepId: stepId,
      parentStepPath: stepPath,
      registry,
      eventLog,
    }),
  };

  return ctx;
}

type StepFnDeps = {
  workflowRunId: string;
  services: RuntimeServices;
  parentStepId: string | null;
  parentStepPath: string[];
  registry: StepRegistry;
  eventLog: EventLog;
};

function createStepFn(deps: StepFnDeps): StepFn {
  return async function step<T>(
    name: string,
    fn: (args: { ctx: WorkflowContext }) => Promise<T>,
    options?: StepOptions,
  ): Promise<T> {
    const parentId = deps.parentStepId;
    const key = options?.key;
    deps.registry.register(name, key, options?.allowDuplicateName);

    const store = deps.services.stores.workflow;
    if (store && !options?.force) {
      const cached = await store.getStepOutput(deps.workflowRunId, {
        parentStepId: parentId,
        name,
        key,
      });
      if (cached !== null) {
        const skippedStepId = createId();
        await deps.eventLog.emit({
          type: "step_skipped",
          workflowRunId: deps.workflowRunId,
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
    const path = [...deps.parentStepPath, pathSegment];
    const startedAt = Date.now();

    await deps.eventLog.emit({
      type: "step_started",
      workflowRunId: deps.workflowRunId,
      stepId,
      parentStepId: parentId,
      name,
      key,
      path,
      seq: 0,
      at: "",
    });

    const childCtx = buildWorkflowContext({
      workflowRunId: deps.workflowRunId,
      services: deps.services,
      stepId,
      parentStepId: parentId,
      stepPath: path,
      registryParentKey: `${deps.workflowRunId}|${stepId}`,
    });

    enterWorkflowContext(childCtx);
    try {
      const output = await fn({ ctx: childCtx });
      const durationMs = Date.now() - startedAt;
      await deps.eventLog.emit({
        type: "step_finished",
        workflowRunId: deps.workflowRunId,
        stepId,
        status: "ok",
        durationMs,
        output,
        seq: 0,
        at: "",
      });
      return output;
    } catch (error) {
      await deps.eventLog.emit({
        type: "step_failed",
        workflowRunId: deps.workflowRunId,
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

function serializeError(error: unknown): unknown {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return error;
}
