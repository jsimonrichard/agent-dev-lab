import type { CoreMessage, LanguageModel, StreamTextResult, ToolSet } from "ai";
import type { z } from "zod";

import type { MessageStore } from "../memory/types";
import type { Template } from "../template/types";
import type { Workflow } from "../workflow/types";
import type { AgentModelInfo } from "./inspect";

export type AgentInstructions<TInput = unknown> = string | Template<TInput>;

export type AgentMemoryConfig = {
  store?: MessageStore;
};

/** Input contract for {@link AgentDefinition.titleWorkflow}. */
export type ConversationTitleInput = {
  messages: CoreMessage[];
};

/** Typed result of {@link AgentDefinition.titleWorkflow}. */
export type ConversationTitleOutput = {
  title: string;
};

export type AgentDefinition<Tools extends ToolSet = ToolSet, TOutput = unknown> = {
  id: string;
  instructions: AgentInstructions;
  /** Required unless {@link AdlRuntimeConfig.defaults.model} is set. */
  model?: LanguageModel;
  tools?: Tools;
  /** Default Zod schema for structured output on every episode. */
  outputSchema?: z.ZodType<TOutput>;
  memory?: AgentMemoryConfig;
  /**
   * Optional workflow that names the conversation after the first successful episode
   * on a new `memoryScope`. It receives the transcript and must return `{ title: string }`.
   * Pin those types with `adl.createWorkflow<ConversationTitleInput, ConversationTitleOutput>`
   * (Zod `input` / `output` are optional). Failures are ignored.
   *
   * The runtime runs this workflow with `{ isolated: true }` so it is a separate
   * persisted run and is not nested inside another workflow's tree. Omit it from
   * `adl.config` `workflows` if it should not appear in the inspection UI.
   */
  titleWorkflow?: Workflow<ConversationTitleInput, ConversationTitleOutput>;
};

/** Links agent events to the active workflow step when called inside `ctx.step`. */
export type AgentWorkflowScope = {
  workflowRunId: string;
  stepId: string | null;
};

export type AgentRunInput<Context = unknown> = {
  memoryScope: string;
  context?: Context;
  user?: string;
  messages?: CoreMessage[];
  /** Per-episode override of the agent's `outputSchema`. */
  outputSchema?: z.ZodType<unknown>;
  /**
   * When running inside a workflow, pass the current {@link WorkflowContext} ids
   * so agent events attach to the correct step. Omit for standalone episodes.
   */
  workflow?: AgentWorkflowScope;
  // cacheable?: boolean; // deferred — episode cache (see notes/resumability.md)
};

/**
 * Result of one agent episode (`agent.run` / `agent.stream`'s `finished` promise).
 *
 * **`text`:** convenience mirror of the AI SDK's aggregated text for this episode
 * (`GenerateTextResult.text` / drained `streamText`). When the model returns tool calls,
 * assistant text may be empty or partial; use `messages` / `newMessages` for the full
 * transcript and `sdk` for raw SDK fields.
 */
export type AgentRunResult<Tools extends ToolSet = ToolSet, TOutput = unknown> = {
  text: string;
  output?: TOutput;
  messages: CoreMessage[];
  newMessages: CoreMessage[];
  /** Raw AI SDK stream result. The agent runner uses `streamText` internally for both `run` and `stream`. */
  sdk: StreamTextResult<Tools, TOutput>;
};

export type AgentStreamInput<Context = unknown> = AgentRunInput<Context>;

export type AgentStreamResult<Tools extends ToolSet = ToolSet, TOutput = unknown> = {
  textStream: StreamTextResult<Tools, TOutput>["textStream"];
  fullStream: StreamTextResult<Tools, TOutput>["fullStream"];
  finished: Promise<AgentRunResult<Tools, TOutput>>;
};

/** Handle returned from `agent.run` — await `result` or call `cancel()` without passing AbortSignal in input. */
export type AgentRunHandle<Tools extends ToolSet = ToolSet, TOutput = unknown> = {
  /** Stable id for this agent episode; available before `agent_started` is emitted. */
  agentCallId: string;
  result: Promise<AgentRunResult<Tools, TOutput>>;
  cancel: () => void;
};

export type AgentStreamHandle<
  Tools extends ToolSet = ToolSet,
  TOutput = unknown,
> = AgentStreamResult<Tools, TOutput> & {
  /** Stable id for this agent episode; available before `agent_started` is emitted. */
  agentCallId: string;
  cancel: () => void;
};

export interface Agent<Context = undefined, Tools extends ToolSet = ToolSet> {
  readonly id: string;
  /**
   * Message-store backend this agent persists transcripts to.
   * Built-ins: `"in-memory"` | `"sqlite"`. Custom stores: their {@link MessageStore.kind},
   * or `"custom"` if omitted.
   */
  readonly memoryKind: string;
  /**
   * Effective model for this agent's episodes (`definition.model`, falling back to the
   * runtime's `defaults.model`). `null` when no model is configured or the model object
   * reveals neither id nor provider — inspectors should omit the field in that case.
   */
  readonly modelInfo: AgentModelInfo | null;
  /**
   * Id of {@link AgentDefinition.titleWorkflow} when this agent auto-titles conversations.
   */
  readonly titleWorkflowId: string | null;
  run(input: AgentRunInput<Context>): AgentRunHandle<Tools>;
  stream(input: AgentStreamInput<Context>): AgentStreamHandle<Tools>;
}
