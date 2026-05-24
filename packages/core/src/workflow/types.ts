import type { z } from "zod";

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
  readonly runId: string;
  readonly stepId: string | null;
  readonly stepPath: string[];
  readonly parentStepId: string | null;

  step: StepFn;

  readonly memoryScope: (suffix: string) => string;

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
      signal?: AbortSignal;
    };

export type WorkflowDefinition<TInput, TOutput> = {
  id: string;
  input?: z.ZodType<TInput>;
  output?: z.ZodType<TOutput>;
  run: (input: TInput, ctx: WorkflowContext) => Promise<TOutput>;
};

export interface Workflow<TInput, TOutput> {
  readonly id: string;
  run(input: TInput, options: WorkflowRunOptions): Promise<TOutput>;
}
