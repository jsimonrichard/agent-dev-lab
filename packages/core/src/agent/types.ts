import {
  stepCountIs,
  type LanguageModel,
  type ModelMessage,
  type StopCondition,
  type StreamTextResult,
  type ToolSet,
} from "ai";
import type { z } from "zod";

import type { MessageStore } from "../stores/types";
import type { Result } from "../result";
import type { Template } from "../template/types";
import type { ToolProvider } from "../tools/provider";
import type { Workflow } from "../workflow/types";
import type { AgentModelInfo } from "./inspect";

/**
 * AI SDK `stopWhen` accepted by {@link Agent.run} / {@link Agent.stream}.
 * Passed through to `streamText`. See https://ai-sdk.dev/docs/agents/loop-control
 */
export type AgentStopWhen = StopCondition<ToolSet> | Array<StopCondition<ToolSet>>;

/** Default cap on model steps per `agent.run()` / `agent.stream()`. */
export const DEFAULT_AGENT_MAX_STEPS = 20;

/**
 * Default {@link AgentDefinition.stopWhen}: continue after tool results until
 * {@link DEFAULT_AGENT_MAX_STEPS} (AI SDK `streamText` defaults to one step).
 */
export const DEFAULT_AGENT_STOP_WHEN: AgentStopWhen = stepCountIs(DEFAULT_AGENT_MAX_STEPS);

/** Inspector label for a resolved {@link AgentStopWhen}. */
export type AgentStopWhenLabel = "default" | "custom";

/** Inspector label for a resolved {@link AgentStopWhen}. */
export function inspectAgentStopWhen(stopWhen: AgentStopWhen | undefined): AgentStopWhenLabel {
  return stopWhen === undefined || stopWhen === DEFAULT_AGENT_STOP_WHEN ? "default" : "custom";
}

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

export type AgentDefinition<
  ToolProviderContext = unknown,
  Tools extends ToolSet = ToolSet,
  TOutput = string,
> = {
  id: string;
  systemPrompt: AgentSystemPrompt;
  /** Required unless {@link AdlRuntimeConfig.defaults.model} is set. */
  model?: LanguageModel;
  /**
   * A fixed tool set, or a provider resolved once per call — typed directly against
   * `ExtendedToolProviderContext<ToolProviderContext>` since a definition (unlike the
   * per-call {@link AgentRunInput.tools} override) is never widened into a heterogeneous
   * {@link AnyAgent}`[]` registry, so it's safe to keep `ToolProviderContext`
   * fully generic here. Overridable per call via {@link AgentRunInput.tools}.
   *
   * The framework never parses or validates `toolProviderContext` — a `ToolProvider` that
   * wants Zod validation/defaults calls `.parse()` itself inside `getTools` (see
   * `createToolProvider`'s doc comment for the recipe). Combine several providers, each with
   * their own context needs, via `combineToolProviders`.
   */
  tools?: Tools | ToolProvider<Tools, ToolProviderContext>;
  /**
   * Default Zod schema for structured output on every episode.
   * When set, {@link AgentRunResult.output} is inferred from the schema; when omitted,
   * `TOutput` is `string` and `output` is the episode text.
   */
  outputSchema?: z.ZodType<TOutput>;
  /**
   * AI SDK [`stopWhen`](https://ai-sdk.dev/docs/agents/loop-control) for this agent's
   * `run` / `stream`. Overridable per call via {@link AgentRunInput.stopWhen}.
   * Defaults to {@link DEFAULT_AGENT_STOP_WHEN} (`stepCountIs(20)`).
   * Pass `stepCountIs(1)` when a workflow should own each model step.
   */
  stopWhen?: AgentStopWhen;
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

export type AgentRunInput<ToolProviderContext = unknown> = {
  /**
   * Conversation key in {@link MessageStore}. Omit to allocate a random scope
   * for this call — later episodes will not share history unless the caller
   * reuses the resolved scope from the handle / result.
   */
  memoryScope?: string;
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
  /** Per-call override of the agent's `stopWhen`. */
  stopWhen?: AgentStopWhen;
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
  /** Per-call override of the agent's `tools`. Wins over `AgentDefinition.tools`. */
  tools?: ToolSet | ToolProvider<ToolSet>;
  /**
   * When running inside a workflow, pass the current {@link WorkflowContext} ids
   * so agent events attach to the correct step. Omit for standalone episodes.
   */
  workflow?: AgentWorkflowScope;
  /**
   * Stays a plain, always-optional field rather than conditionally required (optional key
   * when `ToolProviderContext` allows `undefined`, required key otherwise) — verified via a
   * minimal repro: that presence-toggle pattern breaks the bivariant `run`/`stream` parameter
   * check `Agent<Context, ...>` needs to widen into a heterogeneous registry, once the target
   * is a concrete type like the old `Agent<unknown, ToolSet, unknown>[]` (TypeScript falls back
   * to strict contravariant checking as soon as a key's *presence* — not just its value type —
   * depends on the type parameter, and that direction always fails for `undefined` vs
   * `unknown`). Registries now widen to {@link AnyAgent} instead, whose `any` params sidestep
   * this class of bug entirely — confirmed by re-running the same repro against `AnyAgent`, no
   * break — but the field stays plain regardless, since there's no upside to the conditional
   * form once nothing requires it. The framework never validates this value — a `ToolProvider`
   * that wants Zod validation/defaults parses it itself inside `getTools`. See
   * `notes/tool-sandboxing.md`.
   */
  toolProviderContext?: ToolProviderContext;
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
  /** Number of AI SDK steps (model requests) made during this turn. */
  turns: number;
  /** Scope this episode persisted to (caller-supplied or a generated id). */
  memoryScope: string;
  /** Raw AI SDK stream result for this episode. */
  sdk: StreamTextResult<Tools, TOutput>;
};

export type AgentStreamInput<ToolProviderContext = unknown> = AgentRunInput<ToolProviderContext>;

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
 * Heterogeneous registries (e.g. `adl.config` `agents`) should widen to {@link AnyAgent}
 * (`Agent<any, any, any>`) — `any` in every slot absorbs the variance mismatches a concretely-typed
 * `Agent<Context, Tools, Output>` would otherwise hit, so no cast is needed to put one in the array.
 */
export interface Agent<
  ToolProviderContext = undefined,
  Tools extends ToolSet = ToolSet,
  out TOutput = string,
> {
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
   * Resolved `stopWhen` (`definition.stopWhen`, or {@link DEFAULT_AGENT_STOP_WHEN}).
   */
  readonly stopWhen: AgentStopWhen;
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
  /**
   * `definition.tools`, verbatim — stays fully parameterized over this agent's own
   * `Tools`/`ToolProviderContext` rather than erased, since widening a concretely-typed `Agent`
   * into {@link AnyAgent} (`any` in every slot) needs no cooperation from this field's type to
   * work. Inspect for `typeof agent.tools?.getTools === "function"`, then read `.contextSchema`
   * off it (e.g. to build a settings UI form) without needing to know which concrete agent
   * you're looking at.
   */
  readonly tools?: Tools | ToolProvider<Tools, ToolProviderContext>;
  run(input: AgentRunInput<ToolProviderContext>): AgentRunHandle<Tools, TOutput>;
  stream(input: AgentStreamInput<ToolProviderContext>): AgentStreamHandle<Tools, TOutput>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyAgent = Agent<any, any, any>;