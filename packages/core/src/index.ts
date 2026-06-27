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
export { createAgent } from "./agent/index";
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
} from "./agent/index";

export { createWorkflow } from "./workflow/index";
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
} from "./workflow/index";

export { createAdlRuntime, resolveRuntimeConfig, resolveRuntimeOverrides } from "./runtime/index";
export type {
  AdlRuntime,
  AdlRuntimeConfig,
  AdlRuntimeOptions,
  AdlRuntimeOverrides,
  RuntimeObservers,
  RuntimeServices,
  RuntimeStores,
} from "./runtime/index";

export { createTemplate, TemplateEngine } from "./template/index";
export { WorkflowContextScope } from "./workflow/workflow-context-scope";
export type {
  Template,
  TemplateConfig,
  TemplateFromPathConfig,
  TemplateFromSourceConfig,
} from "./template/index";

export { inMemoryMessageStore } from "./memory/index";
export { inMemoryWorkflowStore } from "./observability/index";
export type { MessageStore } from "./memory/index";

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
} from "./observability/index";

export { createToolFromAgent, createToolFromWorkflow } from "./tools/index";
export type { CreateToolFromAgentOptions, CreateToolFromWorkflowOptions } from "./tools/index";

export { loadPromptFile, resolvePromptPath } from "./prompt/load";
export { renderPromptTemplate } from "./prompt/render";

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
} from "./project/index";

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
