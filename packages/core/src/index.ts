/**
 * @packageDocumentation
 *
 * Headless ADL core — agents, workflows, templates, runtime wiring.
 *
 * Cross-cutting guides (project layout, workflow steps, ALS) are in **apps/docs** Starlight.
 * Focused API docs live here as JSDoc on exports.
 *
 * **AI SDK (v5):** re-exports `generateText`, `streamText`, `tool`, `CoreMessage`, `LanguageModel`.
 * Import `stepCountIs` from `ai` for workflow tool loops. Single internal `streamText` path for
 * `agent.run` and `agent.stream`; commits `response.messages` to MessageStore.
 *
 * **ADL additions:** `adl.createAgent`, `adl.createWorkflow`, `memoryScope`, MessageStore,
 * WorkflowStore, WorkflowContext.step, `adl.createTemplate`.
 */
export { createAgent } from "./agent/index.js";
export type {
  Agent,
  AgentDefinition,
  AgentInstructions,
  AgentMemoryConfig,
  AgentRunHandle,
  AgentRunInput,
  AgentRunResult,
  AgentStreamHandle,
  AgentStreamInput,
  AgentStreamResult,
  AgentWorkflowScope,
} from "./agent/index.js";

export { createWorkflow } from "./workflow/index.js";
export type {
  CustomWorkflowEvent,
  StepFn,
  StepIdentity,
  StepOptions,
  Workflow,
  WorkflowContext,
  WorkflowDefinition,
  WorkflowRunHandle,
  WorkflowRunStartOptions,
  WorkflowStreamHandle,
} from "./workflow/index.js";

export {
  createAdlRuntime,
  resolveRuntimeConfig,
  resolveRuntimeOverrides,
} from "./runtime/index.js";
export type {
  AdlRuntime,
  AdlRuntimeConfig,
  AdlRuntimeOptions,
  AdlRuntimeOverrides,
  RuntimeObservers,
  RuntimeServices,
  RuntimeStores,
} from "./runtime/index.js";

export { createTemplate, TemplateEngine } from "./template/index.js";
export { WorkflowContextScope } from "./workflow/workflow-context-scope.js";
export type {
  Template,
  TemplateConfig,
  TemplateFromPathConfig,
  TemplateFromSourceConfig,
} from "./template/index.js";

export { inMemoryMessageStore } from "./memory/index.js";
export { inMemoryWorkflowStore } from "./observability/index.js";
export type { MessageStore } from "./memory/index.js";

export type {
  AgentEventBase,
  AgentFailedEvent,
  AgentObserver,
  AgentObserverEvent,
  AgentObservers,
  ListEventsFilter,
  ListEventsScope,
  RunEvent,
  RunEventOfType,
  RunEventType,
  StepRecord,
  StepSlot,
  WorkflowObserver,
  WorkflowObserverEvent,
  WorkflowObservers,
  WorkflowRunEventBase,
  WorkflowRunSummary,
  WorkflowStartedEvent,
  WorkflowStore,
} from "./observability/index.js";

export { createToolFromAgent, createToolFromWorkflow } from "./tools/index.js";
export type { CreateToolFromAgentOptions, CreateToolFromWorkflowOptions } from "./tools/index.js";

export { loadPromptFile, resolvePromptPath } from "./prompt/load.js";
export { renderPromptTemplate } from "./prompt/render.js";

export {
  ADL_CONFIG_FILENAMES,
  ADL_PROJECT_ROOT_ENV,
  ADL_FRAMEWORK_DEV_ENV,
  findAdlConfigPath,
  findAdlProjectRootFromCwd,
  loadAdlProject,
  resolveProjectRoot,
  type AdlConfigFilename,
  type AdlProjectConfig,
  type AdlProjectDefaults,
  type LoadedAdlProject,
} from "./project/index.js";

export { generateText, streamText, tool } from "ai";
export type { CoreMessage, LanguageModel, ToolSet } from "ai";

/** Package identity for health checks and dev tooling. */
export function createCoreShell() {
  return {
    name: "agent-development-lab/core",
    capabilities: [
      "v1 API surface (draft)",
      "createAdlRuntime + explicit runtime wiring",
      "project config load + registry indexing",
      "adl.createTemplate / createTemplate(runtime, config)",
      "agent.run / agent.stream",
      "workflow.run / workflow.stream with WorkflowStore + observers",
    ],
  };
}
