import type { CoreMessage, GenerateTextResult, LanguageModel, StreamTextResult, ToolSet } from "ai";
import type { z } from "zod";

import type { MessageStore } from "../memory/types";
import type { Template } from "../template/types";

export type AgentInstructions<TInput = unknown> = string | Template<TInput>;

export type AgentMemoryConfig = {
  store?: MessageStore;
};

export type AgentDefinition<Tools extends ToolSet = ToolSet, TOutput = unknown> = {
  id: string;
  instructions: AgentInstructions;
  model: LanguageModel;
  tools?: Tools;
  /** Default Zod schema for structured output on every episode. */
  outputSchema?: z.ZodType<TOutput>;
  memory?: AgentMemoryConfig;
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
  sdk: GenerateTextResult<Tools, TOutput>;
};

export type AgentStreamInput<Context = unknown> = AgentRunInput<Context>;

export type AgentStreamResult<Tools extends ToolSet = ToolSet, TOutput = unknown> = {
  textStream: StreamTextResult<Tools, TOutput>["textStream"];
  fullStream: StreamTextResult<Tools, TOutput>["fullStream"];
  finished: Promise<AgentRunResult<Tools, TOutput>>;
};

/** Handle returned from `agent.run` — await `result` or call `cancel()` without passing AbortSignal in input. */
export type AgentRunHandle<Tools extends ToolSet = ToolSet, TOutput = unknown> = {
  result: Promise<AgentRunResult<Tools, TOutput>>;
  cancel: () => void;
};

export type AgentStreamHandle<
  Tools extends ToolSet = ToolSet,
  TOutput = unknown,
> = AgentStreamResult<Tools, TOutput> & {
  cancel: () => void;
};

export interface Agent<Context = undefined, Tools extends ToolSet = ToolSet> {
  readonly id: string;
  run(input: AgentRunInput<Context>): AgentRunHandle<Tools>;
  stream(input: AgentStreamInput<Context>): AgentStreamHandle<Tools>;
}
