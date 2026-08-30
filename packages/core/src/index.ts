import { readFileSync } from "node:fs";

/**
 * @packageDocumentation
 *
 * Headless ADL core — agents, workflows, templates, runtime wiring.
 *
 * Cross-cutting guides (project layout, workflow steps, ALS) are in **apps/docs** Starlight.
 * Focused API docs live here as JSDoc on exports.
 *
 * **AI SDK (v5):** re-exports `generateText`, `streamText`, `tool`, `stepCountIs`,
 * `ModelMessage` (preferred; `CoreMessage` is the deprecated AI SDK alias),
 * `LanguageModel`. Single internal `streamText` path for `agent.run` and
 * `agent.stream`; commits `response.messages` to MessageStore.
 * `agent.run` loops model requests until `endWhen` (default `"ends-with-text"`);
 * pass `"api-call-ends"` for one SDK step. Tool call/result events still fire.
 * Agent turns forward OpenTelemetry via AI SDK `experimental_telemetry` (disable
 * with `createAdlRuntime({ telemetry: { isEnabled: false } })`).
 *
 * **ADL additions:** `adl.createAgent`, `adl.createWorkflow`, `memoryScope`, MessageStore,
 * WorkflowStore, WorkflowContext.step, `adl.createTemplate`.
 */
export {
  createAgent,
  AGENT_END_WHEN,
  countToolCallParts,
  CUSTOM_MODEL_ID,
  DEFAULT_AGENT_END_WHEN,
  DEFAULT_AGENT_MAX_TURNS,
  inspectAgentEndWhen,
  evaluateEndWhen,
  hasAssistantText,
  lastAssistantEndPart,
  inspectLanguageModel,
  formatSystemPromptConflictWarning,
  inspectSystemPrompt,
  inspectSystemPromptPath,
  resolveEpisodeSystemPrompt,
  resolveSystemPromptText,
  splitStoredSystemPrompt,
  withStoredSystemPrompt,
} from "./agent";
export { err, fromAsyncThrowable, fromThrowable, ok, unwrap, unwrapErr } from "./result";
export type { Err, Ok, Result } from "./result";
export type {
  Agent,
  AgentDefinition,
  AgentEndWhen,
  AgentEndWhenInput,
  AgentEndWhenName,
  AgentEndWhenPredicate,
  AgentSystemPrompt,
  AgentMemoryConfig,
  AgentModelInfo,
  AgentRunHandle,
  AgentRunInput,
  AgentRunResult,
  AgentStreamHandle,
  AgentStreamInput,
  AgentStreamResult,
  AgentWorkflowScope,
  ConversationTitleInput,
  ConversationTitleOutput,
  AssistantEndPart,
  EvaluateEndWhenOptions,
  ResolveEpisodeSystemPromptInput,
  ResolveEpisodeSystemPromptResult,
  SystemPromptConflictStrategy,
} from "./agent";

export { createWorkflow, createWorkflowFromAgent } from "./workflow";
export type {
  CreateWorkflowFromAgentOptions,
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
  AdlOpenTelemetrySettings,
  AdlTelemetrySettings,
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
} from "./stores";
export type {
  InspectorSessionFork,
  InspectorSessionRecord,
  MessageStore,
  SqliteStoreOptions,
} from "./stores";
export {
  DEFAULT_EVENT_LOG_MAX_EVENTS,
  EVENT_SCHEMA_VERSION,
  inMemoryEventLog,
  InMemoryEventLog,
  inMemoryWorkflowStore,
  sqliteWorkflowStore,
} from "./observability";
export type {
  AgentEpisodeSummary,
  EventLog,
  InMemoryEventLogOptions,
  LoggedRunEvent,
} from "./observability";

export type {
  AgentEventBase,
  AgentFailedEvent,
  AgentWarningEvent,
  AgentObserver,
  AgentObserverEvent,
  AgentObservers,
  ListEventsFilter,
  ListEventsScope,
  ListLoggedEventsFilter,
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
  WorkflowTitleSetEvent,
  AgentTitleSetEvent,
} from "./observability";

export { createToolFromAgent, createToolFromWorkflow } from "./tools";
export type {
  CreateToolFromAgentOptions,
  CreateToolFromWorkflowOptions,
  DefaultToolInput,
} from "./tools";

export { loadPromptFile, resolvePromptPath, shouldRereadPromptFileOnRender } from "./template/load";
export { renderPromptTemplate } from "./template/render";

export {
  ADL_CONFIG_FILENAMES,
  ADL_PROJECT_ROOT_ENV,
  ADL_FRAMEWORK_DEV_ENV,
  ADL_PROJECT_WATCH_ENV,
  findAdlConfigPath,
  findAdlProjectRootFromCwd,
  invalidateAdlConfigCache,
  loadAdlProject,
  loadAdlEnv,
  loadAdlProjectEnv,
  resolveProjectRoot,
  shouldReloadAdlProjectPath,
  isIgnoredAdlProjectSegment,
  watchAdlProject,
  type AdlConfigFilename,
  type AdlProjectConfig,
  type AdlProjectReloadInfo,
  type AdlProjectWatchHandlers,
  type LoadedAdlProject,
} from "./project";

export { resolveAdlSqlitePath, DEFAULT_SQLITE_RELATIVE_PATH } from "@agent-dev-lab/common";

export { generateText, stepCountIs, streamText, tool } from "ai";
export type {
  CoreMessage,
  InferToolInput,
  InferToolOutput,
  LanguageModel,
  ModelMessage,
  Tool,
  ToolSet,
} from "ai";

const corePackage = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as {
  version: string;
};

/** Package identity for health checks and dev tooling. */
export function createCoreShell() {
  return {
    name: "@agent-dev-lab/core",
    version: corePackage.version,
  };
}
