/** Production inspector UI view-model shapes (not test fixtures). */

import type { TokenUsage } from "@agent-dev-lab/core";

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

export interface InspectorProject {
  name: string;
  root: string;
  configPath: string;
  devMode: DevMode;
  coreVersion: string;
  workflowIds: string[];
  agentIds: string[];
}

export interface InspectorWorkflowSummary {
  id: string;
  description: string;
}

export interface InspectorAgentSummary {
  id: string;
  description: string;
}

export interface InspectorRunSummary {
  runId: string;
  workflowId: string;
  status: RunStatus;
  startedAt: string;
  finishedAt?: string;
  inputPreview: string;
  title?: string;
  tags: string[];
  /**
   * Sum of finished agent-episode token usage for this workflow run.
   * Absent when no episode reported usage.
   */
  usage?: TokenUsage;
  /** Immediate parent run when nested; null/omitted for roots and isolated. */
  parentWorkflowRunId?: string | null;
  /**
   * Parent step that invoked this nest, or null when nested at the parent
   * workflow root. Absent on older summaries (treat as root-level nest).
   */
  parentStepId?: string | null;
  /** Prior forest root when this run is a new attempt (`seedRetryAttempt`). */
  retriesFromRunId?: string | null;
  /** Prior run id when this nested run is a fully-replayed copy. */
  replayOfRunId?: string | null;
}

export type RunEventType =
  | "run_started"
  | "step_started"
  | "step_skipped"
  | "step_finished"
  | "step_failed"
  | "agent_started"
  | "agent_finished"
  | "agent_warning"
  | "text_delta"
  | "messages_committed"
  | "run_finished"
  | "run_failed"
  | "run_cancelled"
  | "agent_failed"
  | "run_title_set";

export interface RunEventBase {
  runSeq: number;
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

export interface StepSkippedEvent extends RunEventBase {
  type: "step_skipped";
  stepId: string;
  parentStepId: string | null;
  name: string;
  key?: string;
  path: string[];
  output?: JsonValue;
  replayedFromStepId?: string | null;
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
  /** Raw `toolProviderContext` from this episode's `agent_started`, when recorded. */
  toolProviderContext?: JsonValue;
}

export interface AgentFinishedEvent extends RunEventBase {
  type: "agent_finished";
  stepId: string;
  episodeId: string;
  durationMs: number;
  /** Provider-reported token totals when present on the core event. */
  usage?: TokenUsage;
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
  episodeId: string;
  messageCount: number;
  /** Transcript length after this commit; omitted on events recorded before this field existed. */
  total?: number;
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

export interface RunTitleSetEvent extends RunEventBase {
  type: "run_title_set";
  title: string;
}

export interface AgentFailedEvent extends RunEventBase {
  type: "agent_failed";
  stepId: string;
  episodeId: string;
  error?: JsonValue;
}

export interface AgentWarningEvent extends RunEventBase {
  type: "agent_warning";
  stepId: string;
  episodeId: string;
  agentId: string;
  memoryScope: string;
  code: "system_prompt_conflict";
  message: string;
}

export type RunEvent =
  | RunStartedEvent
  | StepStartedEvent
  | StepFinishedEvent
  | StepSkippedEvent
  | StepFailedEvent
  | AgentStartedEvent
  | AgentFinishedEvent
  | AgentFailedEvent
  | AgentWarningEvent
  | TextDeltaEvent
  | MessagesCommittedEvent
  | RunFinishedEvent
  | RunFailedEvent
  | RunCancelledEvent
  | RunTitleSetEvent;

export type StepNodeStatus = "running" | "completed" | "failed";

export interface StepNode {
  stepId: string;
  parentStepId: string | null;
  name: string;
  key?: string;
  path: string[];
  status: StepNodeStatus;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  output?: unknown;
  error?: unknown;
  /** Step output was copied from a prior attempt (not re-executed). */
  copiedFromPriorAttempt?: boolean;
  /** Prior step id on the forest this attempt retries (`retriesFromRunId`). */
  replayedFromStepId?: string | null;
  children: StepNode[];
  agentEpisodes: AgentEpisode[];
}

export interface AgentEpisode {
  episodeId: string;
  agentId: string;
  memoryScope: string;
  status: "running" | "completed" | "failed";
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  streamingText: string;
  error?: unknown;
  /** Non-fatal diagnostics (e.g. system-prompt conflict). */
  warnings: string[];
  /** Raw `toolProviderContext` recorded on `agent_started`, when present. */
  toolProviderContext?: JsonValue;
  /** Provider-reported token totals from `agent_finished`, when present. */
  usage?: TokenUsage;
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
  messages: InspectorMessage[];
}

/** Standalone agent chat listed in the agent sidebar (mock). */
export interface InspectorAgentConversation {
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
  messages: InspectorMessage[];
  /** Latest agent call on this conversation, when one has started. */
  latestAgentCallId: string | null;
  /** From the latest `agent_started` on this conversation; empty if none yet. */
  tags: string[];
  /**
   * Seed for the next-turn toolProviderContext draft (inspector UI only):
   * latest local episode, else fork source episode, else agent default.
   */
  nextToolProviderContextSeed?: JsonValue;
  /**
   * Snapshot from the latest local episode (or the focused `?call=` episode when
   * the loader supplies one). Absent when never recorded.
   */
  latestEpisodeToolProviderContext?: JsonValue;
  /**
   * Sum of finished episode token usage for this conversation's `memoryScope`.
   * Absent when no finished episode reported usage.
   */
  usage?: TokenUsage;
  /**
   * Per-episode token usage keyed by `agentCallId`, for the inspect panel's
   * "This call" column without a second round-trip.
   */
  episodeUsageByCallId: Record<string, TokenUsage>;
  /**
   * Stored transcript message id → `agentCallId` for episode Inspect links.
   * Built from each episode's `agent_messages_committed` totals.
   */
  messageAgentCallIds: Record<string, string>;
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
  title?: string;
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
  providerExecuted?: boolean;
  /** Display-only: args were taken from a hosted `action` (e.g. OpenAI web_search). */
  providerAction?: boolean;
};

export type ChatToolResultPart = {
  type: "tool-result";
  toolCallId: string;
  toolName: string;
  result: JsonValue;
  isError?: boolean;
  providerExecuted?: boolean;
};

export type ChatMessagePart = ChatTextPart | ChatToolCallPart | ChatToolResultPart;

export interface InspectorMessage {
  id: string;
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  parts?: ChatMessagePart[];
}

/** Transcripts keyed by agent `memoryScope`, prefetched per workflow run. */
export type MessagesByScope = Record<string, InspectorMessage[]>;

export interface PrefetchedRunMessages {
  messagesByScope: MessagesByScope;
  /** Highest run-event runSeq observed when these messages were loaded. */
  eventSeq: number;
}

export interface MockConversation {
  memoryScope: string;
  agentId: string;
  messages: InspectorMessage[];
}
