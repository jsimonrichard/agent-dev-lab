import { tool, zodSchema, type ToolSet } from "ai";
import { z } from "zod";

import type { Agent, AgentRunInput } from "../agent/types";
import type { AdlRuntime } from "../runtime/types";
import type { WorkflowContext } from "../workflow/types";

export type CreateToolFromAgentOptions<Context> = {
  name?: string;
  description: string;
  mapRun: (
    toolArgs: unknown,
    meta: { ctx: WorkflowContext },
  ) => Pick<AgentRunInput<Context>, "memoryScope" | "user" | "context" | "messages" | "workflow">;
};

/** Expose a single agent episode as an AI SDK tool. Prefer {@link AdlRuntime.createToolFromAgent}. */
export function createToolFromAgent<Context>(
  runtime: AdlRuntime,
  agent: Agent<Context>,
  options: CreateToolFromAgentOptions<Context>,
): ToolSet[string] {
  return tool({
    ...(options.name !== undefined ? { name: options.name } : {}),
    description: options.description,
    inputSchema: zodSchema(z.object({}).catchall(z.unknown())),
    execute: async (toolArgs) => {
      const workflowCtx = runtime.services.workflowContextScope.peek();
      if (!workflowCtx) {
        throw new Error(
          "createToolFromAgent: no WorkflowContext — call from within a workflow run or step",
        );
      }
      const runInput = options.mapRun(toolArgs, { ctx: workflowCtx });
      const handle = agent.run(runInput);
      const result = await handle.result;
      if (result.output !== undefined) {
        return result.output;
      }
      return { text: result.text, messages: result.newMessages };
    },
  }) as ToolSet[string];
}
