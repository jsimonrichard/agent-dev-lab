import type { z } from "zod";

import type { TraceContext } from "../observability/tracing";
import type { LoadedAdlProject } from "../project/resolve";

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

export type WorkflowContext = {
  /** Id of this workflow invocation (shared by all steps/agents in the run). */
  readonly workflowRunId: string;
  readonly stepId: string | null;
  readonly stepPath: string[];
  readonly parentStepId: string | null;

  step: StepFn;

  readonly memoryScope: (suffix: string) => string;

  /** Active trace context — use for custom spans; OTel observers nest spans from run events. */
  readonly trace: TraceContext;

  emit(event: CustomWorkflowEvent): void;
};

export type StepFn = <T>(
  name: string,
  fn: (args: { ctx: WorkflowContext }) => Promise<T>,
  options?: StepOptions,
) => Promise<T>;

export type WorkflowRunOptions =
  | WorkflowContext
  | {
      project: LoadedAdlProject;
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
