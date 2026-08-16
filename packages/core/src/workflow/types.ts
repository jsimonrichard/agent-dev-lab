import type { RunEvent } from "../observability/events";
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
 * Passed to the workflow author's `run` function. Callers may pass {@link WorkflowRunStartOptions.parentCtx}
 * on {@link Workflow.run} to nest under a parent run; otherwise the runtime supplies context.
 *
 * @see apps/docs — core/runtime
 */
export interface WorkflowContext {
  /** Id of this workflow invocation (shared by all steps/agents in the run). */
  readonly workflowRunId: string;
  readonly stepId: string | null;
  readonly stepPath: string[];
  readonly parentStepId: string | null;

  /**
   * Run a named, cacheable unit of work. Child contexts are built from the parent host
   * (`this`). Agent/tool bridge uses scoped ALS only inside step bodies and the workflow body.
   */
  step: StepFn;

  /**
   * Build a {@link AgentRunInput.memoryScope} namespaced to this workflow run:
   * `${workflowRunId}:${suffix}`.
   */
  readonly memoryScopeWithSuffix: (suffix: string) => string;

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
 * `TInput` is the parsed schema output (defaults applied). `TRawInput` is what
 * {@link Workflow.run} / {@link Workflow.stream} accept before parse.
 */
export type WorkflowDefinition<TInput, TOutput, TRawInput = TInput> = {
  id: string;
  input?: z.ZodType<TInput, z.ZodTypeDef, TRawInput>;
  output?: z.ZodType<TOutput>;
  /** Author implementation — receives parsed input and `ctx` from the runtime. */
  run: (input: TInput, ctx: WorkflowContext) => Promise<TOutput>;
};

export type WorkflowRunHandle<TOutput> = {
  /** Available immediately when the run starts (for SSE / store subscription). */
  readonly workflowRunId: string;
  result: Promise<TOutput>;
  cancel: () => void;
};

/** Same execution as {@link Workflow.run} plus a live in-process tail of {@link RunEvent}s. */
export type WorkflowStreamHandle<TOutput> = WorkflowRunHandle<TOutput> & {
  events: AsyncIterable<RunEvent>;
};

/**
 * Optional start parameters for {@link Workflow.run}.
 * Hosts (e.g. inspection UI) may attach per-run observers for in-process event tails;
 * persisted history still goes through {@link WorkflowStore} on the runtime.
 */
export type WorkflowRunStartOptions = {
  /** Pre-allocate a run id so subscribers can connect before execution finishes. */
  workflowRunId?: string;
  /**
   * Nest under an existing workflow run (shared `workflowRunId`, step cache, event stream).
   * When omitted inside a workflow body or step, the active {@link WorkflowContext} is read
   * from the runtime's scoped ALS — same pattern as `agent.run` workflow linkage.
   */
  parentCtx?: WorkflowContext;
  /** Merged with runtime observers for this invocation only. */
  extraObservers?: {
    workflows?: WorkflowObservers;
    agents?: AgentObservers;
  };
};

export interface Workflow<TInput, TOutput, TRawInput = TInput> {
  readonly id: string;
  /** Optional Zod schema used to validate {@link run} / {@link stream} input. */
  readonly input?: z.ZodType<TInput, z.ZodTypeDef, TRawInput>;
  /**
   * Start a workflow run. The bound runtime creates {@link WorkflowContext} internally.
   * Use {@link workflowRunId} on the handle to subscribe before `result` settles.
   */
  run(input: TRawInput, options?: WorkflowRunStartOptions): WorkflowRunHandle<TOutput>;
  /**
   * Start a run and expose live run events (steps, agents, lifecycle) for in-process consumers.
   * Persisted history still goes through {@link WorkflowStore}; production UI may use
   * `run` + SSE instead.
   */
  stream(input: TRawInput): WorkflowStreamHandle<TOutput>;
}
