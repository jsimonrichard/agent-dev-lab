/** Mock shapes aligned with notes/streaming-api.md and workflow-api.md — wire to runtime later. */

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
  output?: unknown;
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
  input: unknown;
}

export interface RunFinishedEvent extends RunEventBase {
  type: "run_finished";
  output?: unknown;
}

export type RunEvent =
  | RunStartedEvent
  | StepStartedEvent
  | StepFinishedEvent
  | AgentStartedEvent
  | AgentFinishedEvent
  | TextDeltaEvent
  | MessagesCommittedEvent
  | RunFinishedEvent;

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

export interface AgentEpisode {
  episodeId: string;
  agentId: string;
  memoryScope: string;
  status: "running" | "completed";
  durationMs?: number;
  streamingText: string;
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
