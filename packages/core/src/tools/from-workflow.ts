import type { ToolSet } from "ai";

import { notImplemented } from "../internal/not-implemented";
import type { Workflow } from "../workflow/types";

export type CreateToolFromWorkflowOptions<TInput> = {
  name?: string;
  description: string;
  mapInput?: (toolArgs: unknown) => TInput;
};

/** Expose a workflow as an AI SDK tool for coordinator agents. @see notes/workflow-api.md */
export function createToolFromWorkflow<TInput, TOutput>(
  workflow: Workflow<TInput, TOutput>,
  options: CreateToolFromWorkflowOptions<TInput>,
): ToolSet[string] {
  void workflow;
  void options;
  notImplemented("createToolFromWorkflow");
}
