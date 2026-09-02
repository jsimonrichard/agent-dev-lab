import type { ToolSet } from "ai";
import { z } from "zod";

import type { Agent, AgentRunInput } from "../agent/types";
import type { AdlRuntime } from "../runtime/types";
import type { Workflow, WorkflowContext } from "./types";

export type CreateWorkflowFromAgentOptions<ToolProviderContext> = {
  /** Defaults to `${agent.id}-as-workflow`. */
  id?: string;
  /**
   * Map the string workflow input to {@link Agent.run}. When omitted, the
   * string is passed as `user`.
   */
  mapRun?: (user: string, meta: { ctx: WorkflowContext }) => AgentRunInput<ToolProviderContext>;
};

/**
 * Wrap an agent as a workflow that accepts a string user message and returns
 * the agent's `output`. Prefer {@link AdlRuntime.createWorkflowFromAgent}.
 */
export function createWorkflowFromAgent<
  ToolProviderContext = undefined,
  Tools extends ToolSet = ToolSet,
  TOutput = string,
>(
  runtime: AdlRuntime,
  agent: Agent<ToolProviderContext, Tools, TOutput>,
  options?: CreateWorkflowFromAgentOptions<ToolProviderContext>,
): Workflow<string, TOutput, string> {
  return runtime.createWorkflow({
    id: options?.id ?? `${agent.id}-as-workflow`,
    inputSchema: z.string(),
    run: async (user, ctx) => {
      // `toolProviderContext` is always a plain optional field on `AgentRunInput` (see its
      // doc comment), so `{ user }` satisfies `AgentRunInput<ToolProviderContext>` for any
      // `ToolProviderContext` — no cast needed. Pass `mapRun` when the agent's tools need a
      // `toolProviderContext`.
      const runInput = options?.mapRun?.(user, { ctx }) ?? { user };
      const result = await agent.run(runInput).result;
      return result.output;
    },
  });
}
