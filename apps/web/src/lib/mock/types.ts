/** UI view-model shapes aligned with notes/streaming-api.md and workflow-api.md. */

/** JSON-serializable value — used for fields crossing the server-function boundary. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type RunStatus = "running" | "completed" | "failed" | "cancelled";

export type DevMode = "framework-dev" | "project-dev" | "serve";

export interface MockProject {
  name: string;
  root: string;
  configPath: string;
  devMode: DevMode;
  coreVersion: string;
  workflowIds: string[];
  agentIds: string[];
}

export interface MockWorkflowSummary {
  id: string;
  description: string;
}

export interface MockAgentSummary {
  id: string;
  description: string;
}

export interface MockAgentToolDefinition {
  name: string;
  description: string;
}

/** Effective model shown in the settings panel; `null` hides the Model section. */
export interface MockAgentModel {
  modelId: string;
  provider?: string;
}

/** Agent configuration shown in the conversation settings panel. */
export interface MockAgentSettings {
  agentId: string;
  model: MockAgentModel | null;
  memoryMode: string;
  tools: MockAgentToolDefinition[];
  outputSchema?: string;
  systemPromptPath?: string;
}

export interface MockRunSummary {
  runId: string;
  workflowId: string;
  status: RunStatus;
  startedAt: string;
  finishedAt?: string;
  inputPreview: string;
  title?: string;
}

export type RunEventType =
  | "run_started"
  | "step_started"
  | "step_finished"
  | "step_failed"
  | "agent_started"
  | "agent_finished"
  | "text_delta"
  | "messages_committed"
  | "run_finished"
  | "run_failed"
  | "run_cancelled"
  | "agent_failed";

export interface RunEventBase {
  seq: number;
  runId: string;
  type: RunEventType;
  at: string;
}

export interface StepStartedEvent extends RunEventBase {
  type: "step_started";
  stepId: string;
  parentStepId: string | null;
  name: string;
  key?: string;
  path: string[];
}

export interface StepFinishedEvent extends RunEventBase {
  type: "step_finished";
  stepId: string;
  durationMs: number;
  output?: JsonValue;
}

export interface StepFailedEvent extends RunEventBase {
  type: "step_failed";
  stepId: string;
  error?: JsonValue;
}

export interface AgentStartedEvent extends RunEventBase {
  type: "agent_started";
  stepId: string;
  agentId: string;
  memoryScope: string;
  episodeId: string;
}

export interface AgentFinishedEvent extends RunEventBase {
  type: "agent_finished";
  stepId: string;
  episodeId: string;
  durationMs: number;
}

export interface TextDeltaEvent extends RunEventBase {
  type: "text_delta";
  stepId: string;
  episodeId: string;
  delta: string;
}

export interface MessagesCommittedEvent extends RunEventBase {
  type: "messages_committed";
  stepId: string;
  memoryScope: string;
  messageCount: number;
}

export interface RunStartedEvent extends RunEventBase {
  type: "run_started";
  workflowId: string;
  input: JsonValue;
}

export interface RunFinishedEvent extends RunEventBase {
  type: "run_finished";
  output?: JsonValue;
}

export interface RunFailedEvent extends RunEventBase {
  type: "run_failed";
  error?: JsonValue;
}

export interface RunCancelledEvent extends RunEventBase {
  type: "run_cancelled";
}

export interface AgentFailedEvent extends RunEventBase {
  type: "agent_failed";
  stepId: string;
  episodeId: string;
  error?: JsonValue;
}

export type RunEvent =
  | RunStartedEvent
  | StepStartedEvent
  | StepFinishedEvent
  | StepFailedEvent
  | AgentStartedEvent
  | AgentFinishedEvent
  | AgentFailedEvent
  | TextDeltaEvent
  | MessagesCommittedEvent
  | RunFinishedEvent
  | RunFailedEvent
  | RunCancelledEvent;

export type StepNodeStatus = "running" | "completed" | "failed";

export interface StepNode {
  stepId: string;
  parentStepId: string | null;
  name: string;
  key?: string;
  path: string[];
  status: StepNodeStatus;
  durationMs?: number;
  output?: unknown;
  error?: unknown;
  children: StepNode[];
  agentEpisodes: AgentEpisode[];
}

export interface AgentEpisode {
  episodeId: string;
  agentId: string;
  memoryScope: string;
  status: "running" | "completed" | "failed";
  durationMs?: number;
  streamingText: string;
  error?: unknown;
}

export interface ForkedAgentSession {
  forkId: string;
  agentId: string;
  sourceWorkflowId: string;
  sourceRunId: string;
  sourceStepId: string;
  sourceEpisodeId: string;
  sourceMemoryScope: string;
  createdAt: string;
  messages: MockMessage[];
}

/** Standalone agent chat listed in the agent sidebar (mock). */
export interface MockAgentConversation {
  runId: string;
  agentId: string;
  title: string;
  preview: string;
  updatedAt: string;
  memoryScope: string;
}

/** Provenance when this chat is an in-workflow episode (not a fork or standalone). */
export interface ConversationWorkflowLink {
  workflowId: string;
  workflowRunId: string;
  stepId: string | null;
  episodeId: string;
}

/** Resolved session for /agent/$agentId/run/$runId — static mock or forked. */
export interface ResolvedAgentConversation {
  runId: string;
  agentId: string;
  title: string;
  messages: MockMessage[];
  forkSession: ForkedAgentSession | null;
  workflowLink: ConversationWorkflowLink | null;
}

export interface RunViewState {
  runId: string;
  workflowId: string;
  status: RunStatus;
  input: unknown;
  output?: unknown;
  error?: unknown;
  lastSeq: number;
  steps: StepNode[];
  startedAt: string;
  finishedAt?: string;
}

export type ChatTextPart = {
  type: "text";
  text: string;
};

export type ChatToolCallPart = {
  type: "tool-call";
  toolCallId: string;
  toolName: string;
  args: JsonValue;
};

export type ChatToolResultPart = {
  type: "tool-result";
  toolCallId: string;
  toolName: string;
  result: JsonValue;
  isError?: boolean;
};

export type ChatMessagePart = ChatTextPart | ChatToolCallPart | ChatToolResultPart;

export interface MockMessage {
  id: string;
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  parts?: ChatMessagePart[];
}

/** Transcripts keyed by agent `memoryScope`, prefetched per workflow run. */
export type MessagesByScope = Record<string, MockMessage[]>;

export interface PrefetchedRunMessages {
  messagesByScope: MessagesByScope;
  /** Highest run-event seq observed when these messages were loaded. */
  eventSeq: number;
}

export interface MockConversation {
  memoryScope: string;
  agentId: string;
  messages: MockMessage[];
}
