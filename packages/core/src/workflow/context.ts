import { raceAbort, throwIfAborted } from "../internal/abort";
import { createId } from "../internal/ids";
import { serializeError } from "../internal/serialize-error";
import { RunRecorder, withActiveSpan } from "../runtime/run-recorder";
import type { RuntimeServices } from "../runtime/types";
import { formatStepPathSegment, StepRegistry } from "./step-registry";
import type { StepOptions, WorkflowContext } from "./types";
import type { RetryAttempt } from "./retry-attempt";

export type WorkflowContextOptions = {
  workflowRunId: string;
  parentWorkflowRunId: string | null;
  services: RuntimeServices;
  stepId: string | null;
  parentStepId: string | null;
  stepPath: string[];
  registryParentKey: string;
  runRecorder: RunRecorder;
  signal: AbortSignal;
  retryAttempt?: RetryAttempt;
};

export class WorkflowContextImpl implements WorkflowContext {
  readonly workflowRunId: string;
  readonly parentWorkflowRunId: string | null;
  readonly stepId: string | null;
  readonly stepPath: string[];
  readonly parentStepId: string | null;
  readonly signal: AbortSignal;
  readonly runRecorder: RunRecorder;
  readonly retryAttempt: RetryAttempt | undefined;

  readonly services: RuntimeServices;

  private readonly registry: StepRegistry;
  private readonly registryParentKey: string;
  private readonly memoryScopes = new Set<string>();

  constructor(options: WorkflowContextOptions) {
    this.workflowRunId = options.workflowRunId;
    this.parentWorkflowRunId = options.parentWorkflowRunId;
    this.services = options.services;
    this.stepId = options.stepId;
    this.parentStepId = options.parentStepId;
    this.stepPath = [...options.stepPath];
    this.signal = options.signal;
    this.registryParentKey = options.registryParentKey;
    this.runRecorder = options.runRecorder;
    this.retryAttempt = options.retryAttempt;
    this.registry = new StepRegistry(this.registryParentKey);
  }

  memoryScopeWithSuffix = (suffix: string): string => `${this.workflowRunId}:${suffix}`;

  accessedMemoryScopes = (): readonly string[] => [...this.memoryScopes];

  noteMemoryScopeAccessed = (memoryScope: string): void => {
    this.memoryScopes.add(memoryScope);
  };

  emit = (name: string, payload?: unknown): void => {
    void this.runRecorder.emit({
      type: "custom",
      workflowRunId: this.workflowRunId,
      stepId: this.stepId,
      name,
      payload,
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
    throwIfAborted(this.signal);

    const parentId = this.stepId;
    const key = options?.key;
    this.registry.register(name, key, options?.allowDuplicateName);

    const pathSegment = formatStepPathSegment(name, key);
    const path = [...this.stepPath, pathSegment];
    const impure = options?.pure === false;

    const store = this.services.stores.workflow;
    if (store && !options?.force) {
      const cached = await store.getStepOutput(this.workflowRunId, { path });
      if (cached !== null) {
        let skippedStepId = createId();
        let replayOfStepId: string | undefined;
        const seeded = (await store.listStepRecords(this.workflowRunId)).find(
          (record) =>
            record.path.length === path.length &&
            record.path.every((segment, index) => segment === path[index]),
        );
        if (seeded) {
          skippedStepId = seeded.stepId;
          replayOfStepId = seeded.replayOfStepId ?? undefined;
        }
        const skippedScopes = seeded?.memoryScopes;
        await this.runRecorder.emit({
          type: "step_skipped",
          workflowRunId: this.workflowRunId,
          stepId: skippedStepId,
          parentStepId: parentId,
          name,
          key,
          path,
          output: cached,
          ...(replayOfStepId ? { replayOfStepId } : {}),
          ...(skippedScopes && skippedScopes.length > 0 ? { memoryScopes: skippedScopes } : {}),
        });
        return cached as T;
      }
    }

    const stepId = createId();
    const startedAt = Date.now();

    await this.runRecorder.emit({
      type: "step_started",
      workflowRunId: this.workflowRunId,
      stepId,
      parentStepId: parentId,
      name,
      key,
      path,
      ...(impure ? { pure: false as const } : {}),
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
        () =>
          this.services.workflowContextScope.run(childCtx, () =>
            raceAbort(this.signal, fn({ ctx: childCtx })),
          ),
      );
      const durationMs = Date.now() - startedAt;
      const memoryScopes = childCtx.accessedMemoryScopes();
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
        ...(impure ? { pure: false as const } : {}),
        ...(memoryScopes.length > 0 ? { memoryScopes: [...memoryScopes] } : {}),
      });
      return output;
    } catch (error) {
      const memoryScopes = childCtx.accessedMemoryScopes();
      await this.runRecorder.emit({
        type: "step_failed",
        workflowRunId: this.workflowRunId,
        stepId,
        parentStepId: parentId,
        name,
        key,
        path,
        error: serializeError(error),
        ...(impure ? { pure: false as const } : {}),
        ...(memoryScopes.length > 0 ? { memoryScopes: [...memoryScopes] } : {}),
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
    parentWorkflowRunId: parent.parentWorkflowRunId,
    services: parent.services,
    stepId: step.stepId,
    parentStepId: step.parentStepId,
    stepPath: step.stepPath,
    registryParentKey: `${parent.workflowRunId}|${step.stepId}`,
    runRecorder: parent.runRecorder,
    signal: parent.signal,
    retryAttempt: parent.retryAttempt,
  });
}

function asWorkflowContextImpl(ctx: WorkflowContext): WorkflowContextImpl {
  return ctx as WorkflowContextImpl;
}

export function refreshWorkflowContext(
  ctx: WorkflowContext,
  services: RuntimeServices,
  runRecorder: RunRecorder,
  signal?: AbortSignal,
): WorkflowContextImpl {
  const impl = asWorkflowContextImpl(ctx);
  return new WorkflowContextImpl({
    workflowRunId: impl.workflowRunId,
    parentWorkflowRunId: impl.parentWorkflowRunId,
    services,
    stepId: impl.stepId,
    parentStepId: impl.parentStepId,
    stepPath: impl.stepPath,
    registryParentKey: impl.stepId ?? impl.workflowRunId,
    runRecorder,
    signal: signal ?? impl.signal,
    retryAttempt: impl.retryAttempt,
  });
}

export function createWorkflowContext(options: WorkflowContextOptions): WorkflowContextImpl {
  return new WorkflowContextImpl(options);
}
