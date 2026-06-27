import { tool, zodSchema, type ToolSet } from "ai";
import { z } from "zod";

import type { AdlRuntime } from "../runtime/types";
import { WorkflowImpl } from "../workflow/workflow-impl";
import type { Workflow, WorkflowContext } from "../workflow/types";

function runNestedWorkflow<TInput, TOutput>(
  workflow: Workflow<TInput, TOutput>,
  input: TInput,
  parentCtx: WorkflowContext,
): Promise<TOutput> {
  if (!(workflow instanceof WorkflowImpl)) {
    throw new Error(
      "createToolFromWorkflow: workflow was not created via createWorkflow / adl.createWorkflow",
    );
  }
  return workflow.runNested(input, parentCtx);
}

export type CreateToolFromWorkflowOptions<TInput> = {
  name?: string;
  description: string;
  mapInput?: (toolArgs: unknown) => TInput;
};

/** Expose a workflow as an AI SDK tool for coordinator agents. @see notes/workflow-api.md */
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
      const parentCtx = runtime.services.workflowContextScope.peek();
      if (!parentCtx) {
        throw new Error(
          "createToolFromWorkflow: no WorkflowContext — call from within a workflow run or step",
        );
      }
      const input = options.mapInput ? options.mapInput(toolArgs) : (toolArgs as TInput);
      const output = await runNestedWorkflow(workflow, input, parentCtx);
      return output as unknown;
    },
  }) as ToolSet[string];
}
