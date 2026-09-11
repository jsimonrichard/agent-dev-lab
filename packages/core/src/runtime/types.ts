import type { LanguageModel, Tool, ToolSet } from "ai";
import type { z } from "zod";

import type { Agent, AgentDefinition } from "../agent/types";
import type { MessageStore } from "../stores/types";
import type { ConversationForkLineage } from "../observability/events";
import type { AgentObservers, WorkflowObservers } from "../observability/observers";
import type { WorkflowStore } from "../observability/workflow-store";
import type { CreateToolFromAgentOptions, DefaultToolInput } from "../tools/from-agent";
import type { CreateToolFromWorkflowOptions } from "../tools/from-workflow";
import type { Template, TemplateConfig } from "../template/types";
import type { CreateWorkflowFromAgentOptions } from "../workflow/from-agent";
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
 * OpenTelemetry settings forwarded to AI SDK `streamText` as `experimental_telemetry`
 * so model and tool spans nest under the ADL agent episode span. This is **not**
 * Vercel analytics — it uses `@opentelemetry/api`. Defaults to enabled
 * (`isEnabled` is not `false`). Pass `{ isEnabled: false }` to disable.
 */
export type AdlOpenTelemetrySettings = {
  isEnabled?: boolean;
  recordInputs?: boolean;
  recordOutputs?: boolean;
  functionId?: string;
  metadata?: Record<string, string>;
};

/** @deprecated Use {@link AdlOpenTelemetrySettings}. */
export type AdlTelemetrySettings = AdlOpenTelemetrySettings;

/** Options for {@link createAdlRuntime}. */
export type AdlRuntimeConfig = AdlRuntimeOptions & {
  defaults?: AdlRuntimeDefaults;
  /** Merged under each agent's `tools` (agent keys win). */
  tools?: ToolSet;
  /** OpenTelemetry / AI SDK `experimental_telemetry` (not Vercel product telemetry). */
  telemetry?: AdlOpenTelemetrySettings;
  /**
   * Identifies which version of the project's code a run came from, recorded
   * as a `version:<value>` tag on every `workflow.run()`. Overrides the commit
   * that would otherwise be resolved from jj or git — set it for a release
   * identifier, or for a project with no VCS at all.
   *
   * `false` disables run version tagging entirely, including the VCS lookup.
   * Use it when tags must not depend on ambient repository state — a test
   * asserting a run's exact tags, for instance. {@link createTestRuntime}
   * defaults to this.
   */
  version?: string | false;
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
  /** OpenTelemetry / AI SDK `experimental_telemetry` (not Vercel product telemetry). */
  telemetry?: AdlOpenTelemetrySettings;
  /** See {@link AdlRuntimeConfig.version}. */
  version?: string | false;
};

/**
 * Bound runtime — primary project API. Create via {@link createAdlRuntime}, reference from `adl.config`.
 *
 * Use `adl.createAgent`, `adl.createWorkflow`, `adl.createTemplate`, and tool helpers on this object
 * in application code. Functional `createAgent(runtime, …)` exports exist for tests only.
 */
export interface AdlRuntime {
  readonly services: RuntimeServices;

  createAgent<ToolProviderContext = undefined, Tools extends ToolSet = ToolSet, TOutput = string>(
    definition: AgentDefinition<ToolProviderContext, Tools, TOutput>,
    overrides?: AdlRuntimeOverrides,
  ): Agent<ToolProviderContext, Tools, TOutput>;

  createWorkflow<TInput, TOutput, TRawInput = TInput>(
    definition: WorkflowDefinition<TInput, TOutput, TRawInput>,
    overrides?: AdlRuntimeOverrides,
  ): Workflow<TInput, TOutput, TRawInput>;

  createToolFromAgent<
    ToolProviderContext = undefined,
    Tools extends ToolSet = ToolSet,
    TOutput = string,
    TToolInput = DefaultToolInput,
  >(
    agent: Agent<ToolProviderContext, Tools, TOutput>,
    options: CreateToolFromAgentOptions<ToolProviderContext, TToolInput>,
  ): Tool<TToolInput, TOutput>;

  createToolFromWorkflow<TInput, TOutput, TRawInput = TInput, TToolInput = TRawInput>(
    workflow: Workflow<TInput, TOutput, TRawInput>,
    options: CreateToolFromWorkflowOptions<TRawInput, TToolInput>,
  ): Tool<TToolInput, TOutput>;

  createWorkflowFromAgent<
    ToolProviderContext = undefined,
    Tools extends ToolSet = ToolSet,
    TOutput = string,
  >(
    agent: Agent<ToolProviderContext, Tools, TOutput>,
    options?: CreateWorkflowFromAgentOptions<ToolProviderContext>,
  ): Workflow<string, TOutput, string>;

  createTemplate<TSchema extends z.ZodType<object>>(
    config: TemplateConfig<TSchema>,
  ): Template<z.infer<TSchema>>;

  /**
   * Records that a conversation was forked out of an agent episode.
   *
   * Forking happens outside any run — the new `memoryScope` is created before
   * its first turn — so there is no {@link WorkflowContext} or agent handle to
   * emit through, and this is the seam for it. Persists a
   * `conversation_forked` {@link RunEvent} (readable back via
   * `listEvents({ memoryScope })`) which projects the lineage into
   * `adl_conversation_metadata.fork_json`.
   *
   * `title` is the forked conversation's initial display name; the caller has
   * a real one at this point, and it is the row's first writer.
   *
   * No-op when the runtime has no workflow store configured, matching how
   * every other event behaves without one.
   */
  recordConversationForked(input: {
    memoryScope: string;
    agentId: string;
    title: string;
    fork: ConversationForkLineage;
  }): Promise<void>;
}
