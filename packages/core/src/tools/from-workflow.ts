import { tool, zodSchema, type ToolSet } from "ai";
import { z } from "zod";

import { getWorkflowImpl } from "../workflow/workflow-impl";
import { peekWorkflowContext } from "../workflow/active-workflow-context";
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
  const bound = getWorkflowImpl(workflow);

  return tool({
    description: options.description,
    inputSchema: zodSchema(z.object({}).catchall(z.unknown())),
    execute: async (toolArgs) => {
      const parentCtx = peekWorkflowContext();
      if (!parentCtx) {
        throw new Error(
          "createToolFromWorkflow: no WorkflowContext — call from within a workflow run or step",
        );
      }
      const input = options.mapInput ? options.mapInput(toolArgs) : (toolArgs as TInput);
      const output = await bound.runNested(input, parentCtx);
      return output as unknown;
    },
  }) as ToolSet[string];
}
