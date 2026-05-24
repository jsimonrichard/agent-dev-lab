import type { ToolSet } from "ai";

import { notImplemented } from "../internal/not-implemented";
import type { Agent, AgentRunInput } from "../agent/types";
import type { WorkflowContext } from "../workflow/types";

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
  void agent;
  void options;
  notImplemented("createToolFromAgent");
}
