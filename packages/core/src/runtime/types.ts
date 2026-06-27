import type { ToolSet } from "ai";
import type { z } from "zod";

import type { Agent, AgentDefinition } from "../agent/types";
import type { MessageStore } from "../memory/types";
import type { AgentObservers, WorkflowObservers } from "../observability/observers";
import type { WorkflowStore } from "../observability/workflow-store";
import type { CreateToolFromAgentOptions } from "../tools/from-agent";
import type { CreateToolFromWorkflowOptions } from "../tools/from-workflow";
import type { Template, TemplateConfig } from "../template/types";
import type { Workflow, WorkflowDefinition } from "../workflow/types";
import type { TemplateEngine } from "../template/engine";

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
 * Wired in `src/adl.ts` — not in `adl.config.ts` (avoids import cycles with registry modules).
 */
export type RuntimeServices = {
  stores: RuntimeStores;
  observers: RuntimeObservers;
  templateEngine: TemplateEngine;
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

  createTemplate<TSchema extends z.ZodType>(
    config: TemplateConfig<TSchema>,
  ): Template<z.infer<TSchema>>;
}
