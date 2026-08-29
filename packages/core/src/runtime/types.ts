import type { LanguageModel, Tool, ToolSet } from "ai";
import type { z } from "zod";

import type { Agent, AgentDefinition } from "../agent/types";
import type { MessageStore } from "../memory/types";
import type { AgentObservers, WorkflowObservers } from "../observability/observers";
import type { WorkflowStore } from "../observability/workflow-store";
import type { CreateToolFromAgentOptions, DefaultToolInput } from "../tools/from-agent";
import type { CreateToolFromWorkflowOptions } from "../tools/from-workflow";
import type { Template, TemplateConfig } from "../template/types";
import type { Workflow, WorkflowDefinition } from "../workflow/types";
import type { TemplateEngine } from "../template/engine";
import type { WorkflowContextScope } from "../workflow/workflow-context-scope";

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

/** Process-wide defaults applied when an agent omits the field. */
export type AdlRuntimeDefaults = {
  model?: LanguageModel;
};

/**
 * Forwarded to AI SDK `streamText` as `experimental_telemetry` so model and tool
 * spans nest under the ADL agent episode span. Defaults to enabled (`isEnabled` is
 * not `false`). Pass `{ isEnabled: false }` to disable.
 */
export type AdlTelemetrySettings = {
  isEnabled?: boolean;
  recordInputs?: boolean;
  recordOutputs?: boolean;
  functionId?: string;
  metadata?: Record<string, string>;
};

/** Options for {@link createAdlRuntime}. */
export type AdlRuntimeConfig = AdlRuntimeOptions & {
  defaults?: AdlRuntimeDefaults;
  /** Merged under each agent's `tools` (agent keys win). */
  tools?: ToolSet;
  telemetry?: AdlTelemetrySettings;
  /**
   * Load `.env*` into `process.env` when constructing the runtime.
   * Defaults to `true` (project root = `process.cwd()`). Pass `false` to skip,
   * or `{ root }` when the ADL project is not the cwd.
   */
  loadEnv?: boolean | { root?: string; mode?: string };
};

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
  defaults: AdlRuntimeDefaults;
  tools: ToolSet;
  telemetry?: AdlTelemetrySettings;
};

/**
 * Bound runtime — primary project API. Create via {@link createAdlRuntime}, reference from `adl.config`.
 *
 * Use `adl.createAgent`, `adl.createWorkflow`, `adl.createTemplate`, and tool helpers on this object
 * in application code. Functional `createAgent(runtime, …)` exports exist for tests only.
 */
export interface AdlRuntime {
  readonly services: RuntimeServices;

  createAgent<Context = undefined, Tools extends ToolSet = ToolSet, TOutput = string>(
    definition: AgentDefinition<Tools, TOutput>,
    overrides?: AdlRuntimeOverrides,
  ): Agent<Context, Tools, TOutput>;

  createWorkflow<TInput, TOutput, TRawInput = TInput>(
    definition: WorkflowDefinition<TInput, TOutput, TRawInput>,
    overrides?: AdlRuntimeOverrides,
  ): Workflow<TInput, TOutput, TRawInput>;

  createToolFromAgent<
    Context,
    Tools extends ToolSet = ToolSet,
    TOutput = string,
    TToolInput = DefaultToolInput,
  >(
    agent: Agent<Context, Tools, TOutput>,
    options: CreateToolFromAgentOptions<Context, TToolInput>,
  ): Tool<TToolInput, TOutput>;

  createToolFromWorkflow<TInput, TOutput, TRawInput = TInput, TToolInput = TRawInput>(
    workflow: Workflow<TInput, TOutput, TRawInput>,
    options: CreateToolFromWorkflowOptions<TRawInput, TToolInput>,
  ): Tool<TToolInput, TOutput>;

  createTemplate<TSchema extends z.ZodType>(
    config: TemplateConfig<TSchema>,
  ): Template<z.infer<TSchema>>;
}
