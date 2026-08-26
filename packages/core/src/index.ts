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
export { createAgent, CUSTOM_MODEL_ID, inspectLanguageModel } from "./agent";
export type {
  Agent,
  AgentDefinition,
  AgentInstructions,
  AgentMemoryConfig,
  AgentModelInfo,
  AgentRunHandle,
  AgentRunInput,
  AgentRunResult,
  AgentStreamHandle,
  AgentStreamInput,
  AgentStreamResult,
  AgentWorkflowScope,
} from "./agent";

export { createWorkflow } from "./workflow";
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
} from "./workflow";

export {
  createAdlRuntime,
  createTestRuntime,
  resolveRuntimeConfig,
  resolveRuntimeOverrides,
} from "./runtime";
export type {
  AdlRuntime,
  AdlRuntimeConfig,
  AdlRuntimeDefaults,
  AdlRuntimeOptions,
  AdlRuntimeOverrides,
  RuntimeObservers,
  RuntimeServices,
  RuntimeStores,
} from "./runtime";

export { AdlError, isAdlError } from "./errors";
export type { AdlErrorCode } from "./errors";

export { createTemplate, TemplateEngine } from "./template";
export { WorkflowContextScope } from "./workflow/workflow-context-scope";
export type {
  Template,
  TemplateConfig,
  TemplateFromPathConfig,
  TemplateFromSourceConfig,
} from "./template";

export {
  CUSTOM_MESSAGE_STORE_KIND,
  inMemoryMessageStore,
  inspectMessageStoreKind,
  sqliteInspectorSessionStore,
  sqliteMessageStore,
} from "./memory";
export type {
  InspectorSessionFork,
  InspectorSessionRecord,
  MessageStore,
  SqliteStoreOptions,
} from "./memory";
export { EVENT_SCHEMA_VERSION, inMemoryWorkflowStore, sqliteWorkflowStore } from "./observability";
export type { AgentEpisodeSummary } from "./observability";

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
} from "./observability";

export { createToolFromAgent, createToolFromWorkflow } from "./tools";
export type { CreateToolFromAgentOptions, CreateToolFromWorkflowOptions } from "./tools";

export { loadPromptFile, resolvePromptPath } from "./prompt/load";
export { renderPromptTemplate } from "./prompt/render";

export {
  ADL_CONFIG_FILENAMES,
  ADL_PROJECT_ROOT_ENV,
  ADL_FRAMEWORK_DEV_ENV,
  findAdlConfigPath,
  findAdlProjectRootFromCwd,
  loadAdlProject,
  loadAdlProjectEnv,
  resolveProjectRoot,
  type AdlConfigFilename,
  type AdlProjectConfig,
  type LoadedAdlProject,
} from "./project";

export { resolveAdlSqlitePath, DEFAULT_SQLITE_RELATIVE_PATH } from "@agent-dev-lab/common";

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
