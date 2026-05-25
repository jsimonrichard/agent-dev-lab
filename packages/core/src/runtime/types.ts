import type { ToolSet } from "ai";

import type { Agent, AgentDefinition } from "../agent/types";
import type { MessageStore } from "../memory/types";
import type { AgentObservers, WorkflowObservers } from "../observability/observers";
import type { WorkflowStore } from "../observability/workflow-store";
import type { CreateToolFromAgentOptions } from "../tools/from-agent";
import type { CreateToolFromWorkflowOptions } from "../tools/from-workflow";
import type { Workflow, WorkflowDefinition } from "../workflow/types";

/** Store wiring — same nested shape for config, overrides, and resolved {@link RuntimeServices}. */
export type RuntimeStoresConfig = {
  message?: MessageStore;
  workflow?: WorkflowStore;
};

export type RuntimeObserversConfig = {
  workflows?: WorkflowObservers;
  agents?: AgentObservers;
};

/**
 * Shared options shape for {@link createAdlRuntime} and per-call overrides on bound factories.
 * Observer lists on overrides are **appended** to runtime defaults (not replaced).
 */
export type AdlRuntimeOptions = {
  stores?: RuntimeStoresConfig;
  observers?: RuntimeObserversConfig;
};

/** Options for {@link createAdlRuntime}. */
export type AdlRuntimeConfig = AdlRuntimeOptions;

/** Per-call overrides when creating agents or workflows on a runtime. */
export type AdlRuntimeOverrides = AdlRuntimeOptions;

export type RuntimeStores = {
  message: MessageStore;
  workflow?: WorkflowStore;
};

export type RuntimeObservers = {
  workflows: WorkflowObservers;
  agents: AgentObservers;
};

/**
 * Process-level services for agents and workflows (stores, observers).
 * Wired in `src/adl.ts` — not in `adl.config.ts` (avoids import cycles with registry modules).
 */
export type RuntimeServices = {
  stores: RuntimeStores;
  observers: RuntimeObservers;
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
