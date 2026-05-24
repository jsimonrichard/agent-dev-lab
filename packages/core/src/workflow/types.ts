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
 * Workflow execution scope. Implemented as a context host: `step` and `emit` are methods
 * that close over parent services and identity — **do not destructure** (`const { step } = ctx`).
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

/**
 * @internal Nested workflow invocation inside a parent step (subworkflow / tool).
 * Not part of the public API.
 */
export type NestedWorkflowRunOptions = {
  parentCtx: WorkflowContext;
};

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

export interface Workflow<TInput, TOutput> {
  readonly id: string;
  /**
   * Start a workflow run. The bound runtime creates {@link WorkflowContext} internally.
   * Use {@link workflowRunId} on the handle to subscribe before `result` settles.
   */
  run(input: TInput): WorkflowRunHandle<TOutput>;
}
