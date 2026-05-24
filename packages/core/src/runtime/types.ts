import type { ToolSet } from "ai";

import type { Agent, AgentDefinition } from "../agent/types";
import type { CreateToolFromAgentOptions } from "../tools/from-agent";
import type { CreateToolFromWorkflowOptions } from "../tools/from-workflow";
import type { Workflow, WorkflowContext, WorkflowDefinition } from "../workflow/types";
import type { AgentObservers, WorkflowObserver } from "../observability/observers";
import type { WorkflowStore } from "../observability/workflow-store";
import type { MessageStore } from "../memory/types";

/**
 * Process-level services for agents and workflows (stores, observers).
 * Wired in `src/adl.ts` — not in `adl.config.ts` (avoids import cycles with registry modules).
 */
export type RuntimeServices = {
  messageStore: MessageStore;
  workflowObservers: WorkflowObserver[];
  agentObservers: AgentObservers;
  workflowStore?: WorkflowStore;
};

/** Options for {@link createAdlRuntime}. */
export type AdlRuntimeConfig = {
  messageStore: MessageStore;
  workflowStore?: WorkflowStore;
  observers?: {
    workflows?: WorkflowObserver[];
    agents?: AgentObservers;
  };
};

/** Per-call overrides when creating agents/workflows on a runtime instance. */
export type AdlRuntimeOverrides = Partial<{
  messageStore: MessageStore;
  workflowStore: WorkflowStore;
}>;

/**
 * Bound runtime (Drizzle/tRPC-style). Created via {@link createAdlRuntime} in `src/adl.ts`.
 * `adl.createAgent` delegates to functional {@link createAgent} with `runtime` injected.
 */
export interface AdlRuntime {
  readonly services: RuntimeServices;

  createAgent<Context = undefined, Tools extends ToolSet = ToolSet, TOutput = unknown>(
    definition: AgentDefinition<Tools, TOutput>,
    overrides?: AdlRuntimeOverrides,
  ): Agent<Context, Tools>;

  createWorkflow<TInput, TOutput>(
    definition: WorkflowDefinition<TInput, TOutput>,
    overrides?: AdlRuntimeOverrides,
  ): Workflow<TInput, TOutput>;

  createWorkflowRunContext(overrides?: AdlRuntimeOverrides): WorkflowContext;

  createToolFromAgent<Context>(
    agent: Agent<Context>,
    options: CreateToolFromAgentOptions<Context>,
  ): ToolSet[string];

  createToolFromWorkflow<TInput, TOutput>(
    workflow: Workflow<TInput, TOutput>,
    options: CreateToolFromWorkflowOptions<TInput>,
  ): ToolSet[string];
}
