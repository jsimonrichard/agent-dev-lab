import type { AgentObservers, WorkflowObservers } from "../observability/observers";
import type { z } from "zod";

export type CustomWorkflowEvent = {
  type: "custom";
  name: string;
  payload: unknown;
};

export type StepOptions = {
  key?: string;
  allowDuplicateName?: boolean;
  force?: boolean;
};

export type StepIdentity = {
  stepId: string;
  name: string;
  key: string | undefined;
  path: string[];
  parentStepId: string | null;
};

/**
 * Workflow execution scope. Implemented by {@link WorkflowContextImpl} (class); prefer
 * `ctx.step(...)` on the instance — do not destructure methods off a plain object host.
 *
 * Passed to the workflow author's `run` function only — not via the public `Workflow.run` API.
 *
 * @see notes/runtime-api.md
 */
export interface WorkflowContext {
  /** Id of this workflow invocation (shared by all steps/agents in the run). */
  readonly workflowRunId: string;
  readonly stepId: string | null;
  readonly stepPath: string[];
  readonly parentStepId: string | null;

  /**
   * Run a named, cacheable unit of work. Child contexts are built from the parent host
   * (`this`) — no ambient AsyncLocalStorage.
   */
  step: StepFn;

  readonly memoryScope: (suffix: string) => string;

  /**
   * Emit a custom run event. `stepId` on the persisted event is omitted at workflow root
   * (when {@link stepId} is null).
   */
  emit(event: CustomWorkflowEvent): void;
}

export type StepFn = <T>(
  name: string,
  fn: (args: { ctx: WorkflowContext }) => Promise<T>,
  options?: StepOptions,
) => Promise<T>;

export type WorkflowDefinition<TInput, TOutput> = {
  id: string;
  input?: z.ZodType<TInput>;
  output?: z.ZodType<TOutput>;
  /** Author implementation — receives `ctx` from the runtime, not from the caller. */
  run: (input: TInput, ctx: WorkflowContext) => Promise<TOutput>;
};

export type WorkflowRunHandle<TOutput> = {
  /** Available immediately when the run starts (for SSE / store subscription). */
  readonly workflowRunId: string;
  result: Promise<TOutput>;
  cancel: () => void;
};

/**
 * Optional start parameters for {@link Workflow.run}.
 * Hosts (e.g. inspection UI) may attach per-run observers for in-process event tails;
 * persisted history still goes through {@link WorkflowStore} on the runtime.
 */
export type WorkflowRunStartOptions = {
  /** Pre-allocate a run id so subscribers can connect before execution finishes. */
  workflowRunId?: string;
  /** Merged with runtime observers for this invocation only. */
  extraObservers?: {
    workflows?: WorkflowObservers;
    agents?: AgentObservers;
  };
};

export interface Workflow<TInput, TOutput> {
  readonly id: string;
  /**
   * Start a workflow run. The bound runtime creates {@link WorkflowContext} internally.
   * Use {@link workflowRunId} on the handle to subscribe before `result` settles.
   */
  run(input: TInput, options?: WorkflowRunStartOptions): WorkflowRunHandle<TOutput>;
}
