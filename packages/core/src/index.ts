/**
 * Headless ADL core library (v1 API draft).
 * Types and factories mirror notes/; execution is implemented incrementally.
 */
export { createAgent } from "./agent";
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
  CreateAgentParams,
} from "./agent";

export { createWorkflow, createWorkflowRunContext } from "./workflow";
export type {
  CreateWorkflowParams,
  CreateWorkflowRunContextOptions,
  CustomWorkflowEvent,
  StepFn,
  StepIdentity,
  StepOptions,
  Workflow,
  WorkflowContext,
  WorkflowDefinition,
  WorkflowRunContext,
  WorkflowRunHandle,
  WorkflowRunOptions,
} from "./workflow";

export { createAdlRuntime, resolveRuntimeConfig, resolveRuntimeOverrides } from "./runtime";
export type { AdlRuntime, AdlRuntimeConfig, AdlRuntimeOverrides, RuntimeServices } from "./runtime";

export { createTemplate } from "./template";
export type {
  Template,
  TemplateConfig,
  TemplateFromPathConfig,
  TemplateFromSourceConfig,
} from "./template";

export { inMemoryMessageStore } from "./memory";
export type { MessageStore } from "./memory";

export type {
  AgentEventBase,
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

export { AdlNotImplementedError } from "./internal/not-implemented";

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
      "createTemplate (path or inline source)",
      "agent/workflow execution (planned)",
    ],
  };
}
