import type { ToolSet } from "ai";

import type { Agent, AgentDefinition } from "../agent/types";
import type { MessageStore } from "../memory/types";
import type { AgentObservers, WorkflowObservers } from "../observability/observers";
import type { WorkflowStore } from "../observability/workflow-store";
import type { CreateToolFromAgentOptions } from "../tools/from-agent";
import type { CreateToolFromWorkflowOptions } from "../tools/from-workflow";
import type { Workflow, WorkflowDefinition } from "../workflow/types";

/**
 * Process-level services for agents and workflows (stores, observers).
 * Wired in `src/adl.ts` — not in `adl.config.ts` (avoids import cycles with registry modules).
 */
export type RuntimeServices = {
  messageStore: MessageStore;
  workflowObservers: WorkflowObservers;
  agentObservers: AgentObservers;
  workflowStore?: WorkflowStore;
};

/** Options for {@link createAdlRuntime}. */
export type AdlRuntimeConfig = {
  /** Defaults to an in-memory store when omitted. */
  messageStore?: MessageStore;
  workflowStore?: WorkflowStore;
  observers?: {
    workflows?: WorkflowObservers;
    agents?: AgentObservers;
  };
};

/**
 * Per-call overrides when creating agents, workflows, or run contexts on a runtime.
 * Observer lists are **appended** to the runtime defaults (not replaced).
 */
export type AdlRuntimeOverrides = {
  messageStore?: MessageStore;
  workflowStore?: WorkflowStore;
  observers?: {
    workflows?: WorkflowObservers;
    agents?: AgentObservers;
  };
};

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

  createToolFromAgent<Context>(
    agent: Agent<Context>,
    options: CreateToolFromAgentOptions<Context>,
  ): ToolSet[string];

  createToolFromWorkflow<TInput, TOutput>(
    workflow: Workflow<TInput, TOutput>,
    options: CreateToolFromWorkflowOptions<TInput>,
  ): ToolSet[string];
}
