import type { ToolSet } from "ai";
import type { z } from "zod";

import type { Agent, AgentDefinition } from "../agent/types.js";
import type { MessageStore } from "../memory/types.js";
import type { AgentObservers, WorkflowObservers } from "../observability/observers.js";
import type { WorkflowStore } from "../observability/workflow-store.js";
import type { CreateToolFromAgentOptions } from "../tools/from-agent.js";
import type { CreateToolFromWorkflowOptions } from "../tools/from-workflow.js";
import type { Template, TemplateConfig } from "../template/types.js";
import type { Workflow, WorkflowDefinition } from "../workflow/types.js";
import type { TemplateEngine } from "../template/engine.js";
import type { WorkflowContextScope } from "../workflow/workflow-context-scope.js";

export type RuntimeStores = {
  message: MessageStore;
  workflow?: WorkflowStore;
};

export type RuntimeObservers = {
  workflows: WorkflowObservers;
  agents: AgentObservers;
};

/**
 * Shared options shape for {@link createAdlRuntime} and per-call overrides on bound factories.
 * `stores` / `observers` are partial — only specified fields override or append (see merge rules).
 */
export type AdlRuntimeOptions = {
  stores?: Partial<RuntimeStores>;
  observers?: Partial<RuntimeObservers>;
};

/** Options for {@link createAdlRuntime}. */
export type AdlRuntimeConfig = AdlRuntimeOptions;

/** Per-call overrides when creating agents or workflows on a runtime. */
export type AdlRuntimeOverrides = AdlRuntimeOptions;

/**
 * Process-level services for agents and workflows (stores, observers).
 * Typically constructed in `src/adl.ts` and exposed via `adl.config.adl`.
 */
export type RuntimeServices = {
  stores: RuntimeStores;
  observers: RuntimeObservers;
  templateEngine: TemplateEngine;
  workflowContextScope: WorkflowContextScope;
};

/**
 * Bound runtime — primary project API. Create via {@link createAdlRuntime}, reference from `adl.config`.
 *
 * Use `adl.createAgent`, `adl.createWorkflow`, `adl.createTemplate`, and tool helpers on this object
 * in application code. Functional `createAgent(runtime, …)` exports exist for tests only.
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

  createTemplate<TSchema extends z.ZodType>(
    config: TemplateConfig<TSchema>,
  ): Template<z.infer<TSchema>>;
}
