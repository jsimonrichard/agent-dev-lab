import { tool, type Tool } from "ai";
import { z } from "zod";

import type { AdlRuntime } from "../runtime/types";
import type { Workflow } from "../workflow/types";

export type CreateToolFromWorkflowOptions<TRawInput, TToolInput = TRawInput> = {
  name?: string;
  description: string;
  /** Zod schema for the LLM-facing tool arguments. When omitted, arguments are a catch-all object. */
  inputSchema?: z.ZodType<TToolInput>;
  mapInput?: (toolArgs: TToolInput) => TRawInput;
};

const defaultInputSchema = z.object({}).catchall(z.unknown());

/** Expose a workflow as an AI SDK tool. Prefer {@link AdlRuntime.createToolFromWorkflow}. */
export function createToolFromWorkflow<TInput, TOutput, TRawInput = TInput, TToolInput = TRawInput>(
  runtime: AdlRuntime,
  workflow: Workflow<TInput, TOutput, TRawInput>,
  options: CreateToolFromWorkflowOptions<TRawInput, TToolInput>,
): Tool<TToolInput, TOutput> {
  return tool<TToolInput, TOutput>({
    ...(options.name !== undefined ? { name: options.name } : {}),
    description: options.description,
    inputSchema: (options.inputSchema ?? defaultInputSchema) as z.ZodType<TToolInput>,
    execute: async (toolArgs: TToolInput) => {
      if (!runtime.services.workflowContextScope.peek()) {
        throw new Error(
          "createToolFromWorkflow: no WorkflowContext — call from within a workflow run or step",
        );
      }
      const input = options.mapInput
        ? options.mapInput(toolArgs)
        : (toolArgs as unknown as TRawInput);
      return workflow.run(input).result;
    },
  } as unknown as Tool<TToolInput, TOutput>);
}
