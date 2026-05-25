import { tool, zodSchema, type ToolSet } from "ai";
import { z } from "zod";

import { peekWorkflowContext } from "../workflow/run-stack";
import { getWorkflowBinding } from "../workflow/bindings";
import { executeNestedWorkflowRun } from "../workflow/execute-run";
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
  const binding = getWorkflowBinding(workflow);
  if (!binding) {
    throw new Error("createToolFromWorkflow: workflow was not created via createWorkflow / adl");
  }

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
      const output = await executeNestedWorkflowRun(binding.definition, input, binding.services, {
        parentCtx,
      });
      return output as unknown;
    },
  }) as ToolSet[string];
}
