import { tool, zodSchema, type ToolSet } from "ai";
import { z } from "zod";

import type { AdlRuntime } from "../runtime/types";
import type { Workflow } from "../workflow/types";

export type CreateToolFromWorkflowOptions<TInput> = {
  name?: string;
  description: string;
  mapInput?: (toolArgs: unknown) => TInput;
};

/** Expose a workflow as an AI SDK tool for coordinator agents. @see apps/docs — core/workflows */
export function createToolFromWorkflow<TInput, TOutput>(
  runtime: AdlRuntime,
  workflow: Workflow<TInput, TOutput>,
  options: CreateToolFromWorkflowOptions<TInput>,
): ToolSet[string] {
  return tool({
    ...(options.name !== undefined ? { name: options.name } : {}),
    description: options.description,
    inputSchema: zodSchema(z.object({}).catchall(z.unknown())),
    execute: async (toolArgs) => {
      if (!runtime.services.workflowContextScope.peek()) {
        throw new Error(
          "createToolFromWorkflow: no WorkflowContext — call from within a workflow run or step",
        );
      }
      const input = options.mapInput ? options.mapInput(toolArgs) : (toolArgs as TInput);
      const output = await workflow.run(input).result;
      return output as unknown;
    },
  }) as ToolSet[string];
}
