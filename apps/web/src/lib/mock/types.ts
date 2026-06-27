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

/** Static agent configuration shown in the agent conversation settings panel (mock). */
export interface MockAgentSettings {
  agentId: string;
  model: string;
  temperature: number;
  maxSteps: number;
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
  | "run_failed";

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
}

export type RunEvent =
  | RunStartedEvent
  | StepStartedEvent
  | StepFinishedEvent
  | StepFailedEvent
  | AgentStartedEvent
  | AgentFinishedEvent
  | TextDeltaEvent
  | MessagesCommittedEvent
  | RunFinishedEvent
  | RunFailedEvent;

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
  children: StepNode[];
  agentEpisodes: AgentEpisode[];
}

export interface MockToolCall {
  id: string;
  name: string;
  args: unknown;
}

export interface MockToolResult {
  toolCallId: string;
  result: unknown;
  isError?: boolean;
}

export interface MockStructuredOutput {
  schemaName: string;
  value: unknown;
}

/** Per-episode artifacts for tools / structured output UI (mock). */
export interface EpisodeArtifacts {
  episodeId: string;
  toolCalls: MockToolCall[];
  toolResults: MockToolResult[];
  structuredOutput?: MockStructuredOutput;
}

export interface AgentEpisode {
  episodeId: string;
  agentId: string;
  memoryScope: string;
  status: "running" | "completed";
  durationMs?: number;
  streamingText: string;
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

/** Resolved session for /agent/$agentId/r/$runId — static mock or forked. */
export interface ResolvedAgentConversation {
  runId: string;
  agentId: string;
  title: string;
  messages: MockMessage[];
  forkSession: ForkedAgentSession | null;
}

export interface RunViewState {
  runId: string;
  workflowId: string;
  status: RunStatus;
  input: unknown;
  output?: unknown;
  lastSeq: number;
  steps: StepNode[];
  startedAt: string;
  finishedAt?: string;
}

export interface MockMessage {
  id: string;
  role: "system" | "user" | "assistant";
  content: string;
}

export interface MockConversation {
  memoryScope: string;
  agentId: string;
  messages: MockMessage[];
}
