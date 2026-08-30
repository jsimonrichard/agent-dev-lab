import type { ToolSet } from "ai";
import { z } from "zod";

import type { Agent, AgentRunInput } from "../agent/types";
import type { AdlRuntime } from "../runtime/types";
import type { Workflow, WorkflowContext } from "./types";

export type CreateWorkflowFromAgentOptions<Context> = {
  /** Defaults to `${agent.id}-as-workflow`. */
  id?: string;
  /**
   * Map the string workflow input to {@link Agent.run}. When omitted, the
   * string is passed as `user`.
   */
  mapRun?: (user: string, meta: { ctx: WorkflowContext }) => AgentRunInput<Context>;
};

/**
 * Wrap an agent as a workflow that accepts a string user message and returns
 * the agent's `output`. Prefer {@link AdlRuntime.createWorkflowFromAgent}.
 */
export function createWorkflowFromAgent<Context, Tools extends ToolSet = ToolSet, TOutput = string>(
  runtime: AdlRuntime,
  agent: Agent<Context, Tools, TOutput>,
  options?: CreateWorkflowFromAgentOptions<Context>,
): Workflow<string, TOutput, string> {
  return runtime.createWorkflow({
    id: options?.id ?? `${agent.id}-as-workflow`,
    input: z.string(),
    run: async (user, ctx) => {
      const runInput = options?.mapRun?.(user, { ctx }) ?? { user };
      const result = await agent.run(runInput).result;
      return result.output;
    },
  });
}
