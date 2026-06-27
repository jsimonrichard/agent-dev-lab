import { tool, zodSchema, type ToolSet } from "ai";
import { z } from "zod";

import type { Agent, AgentRunInput } from "../agent/types";
import { AgentImpl } from "../agent/agent-impl";
import type { WorkflowContext } from "../workflow/types";

function asAgentImpl<Context>(agent: Agent<Context>): AgentImpl<Context> {
  if (!(agent instanceof AgentImpl)) {
    throw new Error("createToolFromAgent: agent was not created via createAgent / adl.createAgent");
  }
  return agent;
}

export type CreateToolFromAgentOptions<Context> = {
  name?: string;
  description: string;
  mapRun: (
    toolArgs: unknown,
    meta: { ctx: WorkflowContext },
  ) => Pick<AgentRunInput<Context>, "memoryScope" | "user" | "context" | "messages" | "workflow">;
};

/** Expose a single agent episode as an AI SDK tool. @see notes/workflow-api.md */
export function createToolFromAgent<Context>(
  agent: Agent<Context>,
  options: CreateToolFromAgentOptions<Context>,
): ToolSet[string] {
  const bound = asAgentImpl(agent);

  return tool({
    ...(options.name !== undefined ? { name: options.name } : {}),
    description: options.description,
    inputSchema: zodSchema(z.object({}).catchall(z.unknown())),
    execute: async (toolArgs) => {
      const workflowCtx = bound.services.workflowContextScope.peek();
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
