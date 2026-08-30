import type { LanguageModel, ModelMessage, StreamTextResult, ToolSet } from "ai";
import type { z } from "zod";

import type { MessageStore } from "../stores/types";
import type { Result } from "../result";
import type { Template } from "../template/types";
import type { Workflow } from "../workflow/types";
import type { AgentModelInfo } from "./inspect";

/**
 * Named stop policies for {@link Agent.run} / {@link Agent.stream}.
 *
 * This is **not** AI SDK `stopWhen` (that option is used internally as
 * `stepCountIs(1)` so ADL owns the episode loop). There is no `exit` policy.
 *
 * - `"ends-with-text"` (default): continue while the last user-facing assistant
 *   part is a tool call, including preamble text followed by a tool call.
 * - `"has-text"`: stop as soon as a request includes any user-facing text.
 * - `"no-tool-calls"`: stop only when a request emits no tool calls.
 * - `"api-call-ends"`: stop after this model request (one SDK step).
 */
export const AGENT_END_WHEN = [
  "ends-with-text",
  "has-text",
  "no-tool-calls",
  "api-call-ends",
] as const;
export type AgentEndWhenName = (typeof AGENT_END_WHEN)[number];

/** Transcript snapshot passed to an {@link AgentEndWhenPredicate}. */
export type AgentEndWhenInput = {
  /** Conversation after this request (no pinned system message). */
  messages: ModelMessage[];
  /** Conversation as sent to this request (no pinned system message). */
  oldMessages: ModelMessage[];
  /** Assistant + tool messages produced by this request. */
  newMessages: ModelMessage[];
};

/** Return `true` to stop making further model requests. */
export type AgentEndWhenPredicate = (input: AgentEndWhenInput) => boolean;

/**
 * When {@link Agent.run} / {@link Agent.stream} stop making model requests.
 * A named policy or a predicate over the full transcript, the messages sent
 * to this request, and this request's new messages.
 */
export type AgentEndWhen = AgentEndWhenName | AgentEndWhenPredicate;
export const DEFAULT_AGENT_END_WHEN: AgentEndWhenName = "ends-with-text";

/** Inspector label for a resolved {@link AgentEndWhen}. */
export function inspectAgentEndWhen(endWhen: AgentEndWhen): AgentEndWhenName | "predicate" {
  return typeof endWhen === "function" ? "predicate" : endWhen;
}
/** Default cap on model requests per `agent.run()` / `agent.stream()`. */
export const DEFAULT_AGENT_MAX_TURNS = 20;

export type AgentSystemPrompt<TInput = unknown> = string | Template<TInput>;

export type AgentMemoryConfig = {
  store?: MessageStore;
};

/** Input contract for {@link AgentDefinition.titleWorkflow}. */
export type ConversationTitleInput = {
  messages: ModelMessage[];
};

/** Typed result of {@link AgentDefinition.titleWorkflow}. */
export type ConversationTitleOutput = {
  title: string;
};

export type AgentDefinition<Tools extends ToolSet = ToolSet, TOutput = string> = {
  id: string;
  systemPrompt: AgentSystemPrompt;
  /** Required unless {@link AdlRuntimeConfig.defaults.model} is set. */
  model?: LanguageModel;
  tools?: Tools;
  /**
   * Default Zod schema for structured output on every episode.
   * When set, {@link AgentRunResult.output} is inferred from the schema; when omitted,
   * `TOutput` is `string` and `output` is the episode text.
   */
  outputSchema?: z.ZodType<TOutput>;
  /**
   * When this agent's `run` / `stream` stop making further model requests.
   * Overridable per call via {@link AgentRunInput.endWhen}.
   * Defaults to {@link DEFAULT_AGENT_END_WHEN}.
   */
  endWhen?: AgentEndWhen;
  /**
   * Maximum model requests per `run` / `stream` when looping.
   * Ignored when the resolved `endWhen` is `"api-call-ends"`.
   * Defaults to {@link DEFAULT_AGENT_MAX_TURNS}.
   */
  maxTurns?: number;
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

/**
 * What to do when a *different* agent runs on a `memoryScope` whose pinned
 * system prompt differs from this agent's. Calling the **same** agent again on
 * that scope is the normal conversation pattern and is never a conflict
 * (including a hot-reloaded definition — the pin still wins).
 *
 * - `"keep-pinned"` (default): reuse the stored prompt.
 * - `"use-current"`: apply this agent's prompt for this episode only. The
 *   stored pin is not rewritten.
 *
 * A warning is emitted unless {@link AgentRunInput.suppressSystemPromptConflictWarning}
 * is set. Prompts are not concatenated — the AI SDK `system` option is a single
 * string, and stacking identities is usually worse than picking one.
 */
export type SystemPromptConflictStrategy = "keep-pinned" | "use-current";

export type AgentRunInput<Context = unknown> = {
  /**
   * Conversation key in {@link MessageStore}. Omit to allocate a random scope
   * for this call — later episodes will not share history unless the caller
   * reuses the resolved scope from the handle / result.
   */
  memoryScope?: string;
  context?: Context;
  user?: string;
  /**
   * Turn messages appended after `user` (if set) and any transcript already
   * stored on {@link AgentRunInput.memoryScope}. Combine with a scope to inject
   * extra turns into an existing conversation; omit the scope for a one-shot
   * list on a generated id.
   */
  messages?: ModelMessage[];
  /** Per-episode override of the agent's `outputSchema`. */
  outputSchema?: z.ZodType<unknown>;
  /** Per-call override of the agent's `endWhen`. */
  endWhen?: AgentEndWhen;
  /** Per-call override of the agent's `maxTurns`. */
  maxTurns?: number;
  /**
   * When a different agent hits this scope with a different system prompt.
   * Defaults to `"keep-pinned"`. Ignored for same-agent follow-ups.
   */
  systemPromptConflict?: SystemPromptConflictStrategy;
  /**
   * Do not `console.warn` when a different agent’s system prompt conflicts
   * with the pin on this scope.
   */
  suppressSystemPromptConflictWarning?: boolean;
  /**
   * When running inside a workflow, pass the current {@link WorkflowContext} ids
   * so agent events attach to the correct step. Omit for standalone episodes.
   */
  workflow?: AgentWorkflowScope;
  // cacheable?: boolean; // deferred — episode cache (see notes/resumability.md)
};

/**
 * Result of one `agent.run` / `agent.stream` turn (possibly several model requests).
 *
 * **`text` / `output`:** the final model response. Intermediate tool-call requests
 * are in `messages` / `newMessages` and as `agent_tool_call` / `agent_tool_result`
 * events — not in `text`.
 *
 * **`output`:** typed payload from {@link AgentDefinition.outputSchema}
 * (or a per-call override). When no schema is set, this is the same string as `text`.
 */
export type AgentRunResult<Tools extends ToolSet = ToolSet, TOutput = string> = {
  text: string;
  output: TOutput;
  messages: ModelMessage[];
  /** All model/tool messages appended during this turn (every request). */
  newMessages: ModelMessage[];
  /** Number of model requests made during this turn. */
  turns: number;
  /** Scope this episode persisted to (caller-supplied or a generated id). */
  memoryScope: string;
  /** Raw AI SDK stream result of the last request. */
  sdk: StreamTextResult<Tools, TOutput>;
};

export type AgentStreamInput<Context = unknown> = AgentRunInput<Context>;

export type AgentStreamResult<Tools extends ToolSet = ToolSet, TOutput = string> = {
  textStream: StreamTextResult<Tools, TOutput>["textStream"];
  fullStream: StreamTextResult<Tools, TOutput>["fullStream"];
  finished: Promise<AgentRunResult<Tools, TOutput>>;
};

/** Handle returned from `agent.run` — await `result` or call `cancel()` without passing AbortSignal in input. */
export type AgentRunHandle<Tools extends ToolSet = ToolSet, TOutput = string> = {
  /** Stable id for this agent episode; available before `agent_started` is emitted. */
  agentCallId: string;
  /** Scope this episode will persist to; available before `agent_started` is emitted. */
  memoryScope: string;
  result: Promise<AgentRunResult<Tools, TOutput>>;
  cancel: () => void;
};

export type AgentStreamHandle<
  Tools extends ToolSet = ToolSet,
  TOutput = string,
> = AgentStreamResult<Tools, TOutput> & {
  /** Stable id for this agent episode; available before `agent_started` is emitted. */
  agentCallId: string;
  /** Scope this episode will persist to; available before `agent_started` is emitted. */
  memoryScope: string;
  cancel: () => void;
};

/**
 * Bound agent. `TOutput` is inferred from {@link AgentDefinition.outputSchema} and
 * defaults to `string` when the schema is omitted.
 *
 * Heterogeneous registries (e.g. `adl.config` `agents`) should widen to
 * `Agent<unknown, ToolSet, unknown>`.
 */
export interface Agent<Context = undefined, Tools extends ToolSet = ToolSet, out TOutput = string> {
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
  /**
   * Resolved stop policy (`definition.endWhen`, or {@link DEFAULT_AGENT_END_WHEN}).
   */
  readonly endWhen: AgentEndWhen;
  /**
   * Resolved request cap (`definition.maxTurns`, or {@link DEFAULT_AGENT_MAX_TURNS}).
   */
  readonly maxTurns: number;
  /**
   * Live resolved system prompt from the agent definition (inspectors).
   * `{ isErr: true }` when the template cannot render (for example required Zod
   * fields and no `demo`) — catalog loads still succeed.
   * New conversations pin the successful text as the first stored message; later
   * episodes from the **same** agent reuse that pin (hot-reload does not change
   * in-flight chats). A *different* agent on the same `memoryScope` keeps the
   * pin by default and warns; see {@link AgentRunInput.systemPromptConflict}.
   */
  readonly systemPrompt: Result<string, string>;
  /**
   * Relative template path when {@link AgentDefinition.systemPrompt} is file-backed;
   * otherwise `null`.
   */
  readonly systemPromptPath: string | null;
  run(input: AgentRunInput<Context>): AgentRunHandle<Tools, TOutput>;
  stream(input: AgentStreamInput<Context>): AgentStreamHandle<Tools, TOutput>;
}
