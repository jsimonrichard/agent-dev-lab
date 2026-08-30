import { tool, type Tool, type ToolSet } from "ai";
import { z } from "zod";

import type { Agent, AgentRunInput } from "../agent/types";
import type { AdlRuntime } from "../runtime/types";
import type { WorkflowContext } from "../workflow/types";

/** Loose object the model may fill when {@link CreateToolFromAgentOptions.inputSchema} is omitted. */
export type DefaultToolInput = Record<string, unknown>;

export type CreateToolFromAgentOptions<Context, TToolInput = DefaultToolInput> = {
  name?: string;
  description: string;
  /**
   * Zod schema for the LLM-facing tool arguments. Inferred as {@link TToolInput}.
   * When omitted, arguments are a catch-all object (`Record<string, unknown>`).
   */
  inputSchema?: z.ZodType<TToolInput>;
  mapRun: (
    toolArgs: TToolInput,
    meta: { ctx?: WorkflowContext },
  ) => Pick<
    AgentRunInput<Context>,
    | "memoryScope"
    | "user"
    | "context"
    | "messages"
    | "endWhen"
    | "maxTurns"
    | "workflow"
    | "systemPromptConflict"
    | "suppressSystemPromptConflictWarning"
  >;
};

const defaultInputSchema: z.ZodType<DefaultToolInput> = z.object({}).catchall(z.unknown());

/**
 * Expose an agent turn as an AI SDK tool. Prefer {@link AdlRuntime.createToolFromAgent}.
 *
 * Works outside a workflow: `meta.ctx` is set only when the tool runs inside a
 * workflow body or step. Standalone calls allocate their own agent episode.
 */
export function createToolFromAgent<
  Context,
  Tools extends ToolSet = ToolSet,
  TOutput = string,
  TToolInput = DefaultToolInput,
>(
  runtime: AdlRuntime,
  agent: Agent<Context, Tools, TOutput>,
  options: CreateToolFromAgentOptions<Context, TToolInput>,
): Tool<TToolInput, TOutput> {
  // AI SDK `NeverOptional<OUTPUT, …>` does not resolve while OUTPUT is generic.
  return tool<TToolInput, TOutput>({
    ...(options.name !== undefined ? { name: options.name } : {}),
    description: options.description,
    inputSchema: options.inputSchema ?? (defaultInputSchema as z.ZodType<TToolInput>),
    execute: async (toolArgs: TToolInput) => {
      const workflowCtx = runtime.services.workflowContextScope.peek();
      const runInput = options.mapRun(toolArgs, { ctx: workflowCtx });
      const handle = agent.run(runInput);
      const result = await handle.result;
      return result.output;
    },
  } as unknown as Tool<TToolInput, TOutput>);
}
