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
  output?: z.ZodType<TOutput>;
  memory?: AgentMemoryConfig;
};

export type AgentRunInput<Context = unknown> = {
  memoryScope: string;
  context?: Context;
  user?: string;
  messages?: CoreMessage[];
  output?: z.ZodType<unknown>;
  /** Future: episode cache when fingerprint matches. Default false. */
  cacheable?: boolean;
  signal?: AbortSignal;
};

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

export interface Agent<Context = undefined, Tools extends ToolSet = ToolSet> {
  readonly id: string;
  run(input: AgentRunInput<Context>): Promise<AgentRunResult<Tools>>;
  stream(input: AgentStreamInput<Context>): Promise<AgentStreamResult<Tools>>;
}
