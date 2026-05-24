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
 * Options for {@link Workflow.run}. Use the root context from
 * {@link AdlRuntime.createWorkflowRunContext} or a child context from `ctx.step`.
 */
export type WorkflowRunOptions = {
  parentCtx: WorkflowContext;
};

export type WorkflowDefinition<TInput, TOutput> = {
  id: string;
  input?: z.ZodType<TInput>;
  output?: z.ZodType<TOutput>;
  run: (input: TInput, ctx: WorkflowContext) => Promise<TOutput>;
};

export type WorkflowRunHandle<TOutput> = {
  result: Promise<TOutput>;
  cancel: () => void;
};

export interface Workflow<TInput, TOutput> {
  readonly id: string;
  run(input: TInput, options: WorkflowRunOptions): WorkflowRunHandle<TOutput>;
}
