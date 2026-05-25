import {
  Output,
  stepCountIs,
  streamText,
  type CoreMessage,
  type GenerateTextResult,
  type StreamTextResult,
  type ToolSet,
} from "ai";
import type { z } from "zod";

import { createId } from "../internal/ids";
import { EventLog } from "../runtime/event-log";
import type { RuntimeServices } from "../runtime/types";
import { peekWorkflowContext } from "../workflow/run-stack";
import { bootstrapSystemMessage } from "./resolve-instructions";
import type { AgentDefinition, AgentRunInput, AgentRunResult, AgentStreamResult } from "./types";

export type AgentEpisodeOptions = {
  definition: AgentDefinition<ToolSet, unknown>;
  input: AgentRunInput<unknown>;
  services: RuntimeServices;
  exposeStream?: boolean;
  abortController?: AbortController;
};

export type AgentEpisodeStart<Tools extends ToolSet = ToolSet> = AgentStreamResult<
  Tools,
  unknown
> & {
  cancel: () => void;
};

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export function startAgentEpisode<Tools extends ToolSet = ToolSet>(
  options: AgentEpisodeOptions,
): AgentEpisodeStart<Tools> {
  const controller = options.abortController ?? new AbortController();
  const streamReady = createDeferred<StreamTextResult<Tools, unknown>>();

  const finished = executeEpisode<Tools>({
    ...options,
    abortSignal: controller.signal,
    onStreamReady: (stream) => streamReady.resolve(stream),
    drainStream: !options.exposeStream,
  }).catch((error) => {
    streamReady.reject(error);
    throw error;
  });

  return {
    textStream: lazyTextStream(
      () => streamReady.promise as unknown as Promise<StreamTextResult<ToolSet, unknown>>,
    ) as StreamTextResult<Tools, unknown>["textStream"],
    fullStream: lazyFullStream(
      () => streamReady.promise as unknown as Promise<StreamTextResult<ToolSet, unknown>>,
    ) as StreamTextResult<Tools, unknown>["fullStream"],
    finished,
    cancel: () => controller.abort(),
  };
}

export async function runAgentEpisode<Tools extends ToolSet = ToolSet>(
  options: AgentEpisodeOptions,
): Promise<{ result: AgentRunResult<Tools> }> {
  const { finished } = startAgentEpisode<Tools>({
    ...options,
    exposeStream: false,
  });
  return { result: await finished };
}

type ExecuteEpisodeOptions<Tools extends ToolSet> = AgentEpisodeOptions & {
  abortSignal: AbortSignal;
  onStreamReady: (stream: StreamTextResult<Tools, unknown>) => void;
  drainStream: boolean;
};

async function executeEpisode<Tools extends ToolSet>(
  options: ExecuteEpisodeOptions<Tools>,
): Promise<AgentRunResult<Tools>> {
  const { definition, input, services, abortSignal, onStreamReady, drainStream } = options;
  const effectiveServices = resolveAgentServices(definition, services);
  const messageStore = effectiveServices.stores.message;

  const activeCtx = peekWorkflowContext();
  const workflowRunId = input.workflow?.workflowRunId ?? activeCtx?.workflowRunId;
  const stepId = input.workflow?.stepId ?? activeCtx?.stepId ?? null;

  const agentCallId = createId();

  const eventLog = new EventLog(effectiveServices, {
    workflowRunId,
    agentCallId,
  });

  await eventLog.emit({
    type: "agent_started",
    agentCallId,
    workflowRunId,
    stepId,
    agentId: definition.id,
    memoryScope: input.memoryScope,
    seq: 0,
    at: "",
  });

  try {
    let messages = await messageStore.load(input.memoryScope);
    messages = await bootstrapSystemMessage(definition.instructions, messages);

    const turnMessages: CoreMessage[] = [];
    if (input.user) {
      turnMessages.push({ role: "user", content: input.user });
    }
    if (input.messages?.length) {
      turnMessages.push(...input.messages);
    }
    if (turnMessages.length > 0) {
      messages = [...messages, ...turnMessages];
    }

    const outputSchema = input.outputSchema ?? definition.outputSchema;
    const streamResult = streamText({
      model: definition.model,
      tools: definition.tools,
      messages,
      experimental_context: input.context,
      abortSignal,
      stopWhen: stepCountIs(1),
      ...(outputSchema
        ? {
            experimental_output: Output.object({
              schema: outputSchema as z.ZodType,
            }),
          }
        : {}),
      onChunk: ({ chunk }) => {
        if (chunk.type === "text-delta") {
          void eventLog.emit({
            type: "agent_text_delta",
            agentCallId,
            workflowRunId,
            stepId,
            delta: chunk.text,
            seq: 0,
            at: "",
          });
        }
      },
    }) as unknown as StreamTextResult<Tools, unknown>;

    onStreamReady(streamResult);

    const structuredPromise = outputSchema
      ? readFinalStructuredOutput(streamResult as unknown as StreamTextResult<ToolSet, unknown>)
      : undefined;

    if (drainStream) {
      await streamResult.text;
    }

    const responseMessages = (await streamResult.response).messages as CoreMessage[];
    const newMessages = responseMessages.length > 0 ? responseMessages : [];
    const allMessages = newMessages.length > 0 ? [...messages, ...newMessages] : messages;

    if (newMessages.length > 0) {
      await messageStore.save(input.memoryScope, allMessages);
    }

    await eventLog.emit({
      type: "agent_messages_committed",
      agentCallId,
      workflowRunId,
      stepId,
      memoryScope: input.memoryScope,
      count: newMessages.length,
      seq: 0,
      at: "",
    });

    const text = await streamResult.text;
    const structuredOutput = structuredPromise ? await structuredPromise : undefined;
    const sdk = await toGenerateTextResult(streamResult, structuredOutput);
    const output = structuredOutput;

    await eventLog.emit({
      type: "agent_finished",
      agentCallId,
      workflowRunId,
      stepId,
      agentId: definition.id,
      seq: 0,
      at: "",
    });

    return {
      text,
      output: output as never,
      messages: allMessages,
      newMessages,
      sdk: sdk as GenerateTextResult<Tools, unknown>,
    };
  } catch (error) {
    await eventLog.emit({
      type: "agent_finished",
      agentCallId,
      workflowRunId,
      stepId,
      agentId: definition.id,
      seq: 0,
      at: "",
    });
    throw error;
  }
}

function lazyTextStream(
  getStream: () => Promise<StreamTextResult<ToolSet, unknown>>,
): StreamTextResult<ToolSet, unknown>["textStream"] {
  return {
    async *[Symbol.asyncIterator]() {
      const result = await getStream();
      for await (const chunk of result.textStream) {
        yield chunk;
      }
    },
  } as unknown as StreamTextResult<ToolSet, unknown>["textStream"];
}

function lazyFullStream(
  getStream: () => Promise<StreamTextResult<ToolSet, unknown>>,
): StreamTextResult<ToolSet, unknown>["fullStream"] {
  return {
    async *[Symbol.asyncIterator]() {
      const result = await getStream();
      for await (const part of result.fullStream) {
        yield part;
      }
    },
  } as unknown as StreamTextResult<ToolSet, unknown>["fullStream"];
}

export function resolveAgentServices(
  definition: AgentDefinition,
  services: RuntimeServices,
): RuntimeServices {
  if (!definition.memory?.store) {
    return services;
  }
  return {
    ...services,
    stores: {
      ...services.stores,
      message: definition.memory.store,
    },
  };
}

async function readFinalStructuredOutput(
  stream: StreamTextResult<ToolSet, unknown>,
): Promise<unknown> {
  let last: unknown;
  try {
    for await (const partial of stream.experimental_partialOutputStream) {
      last = partial;
    }
  } catch {
    return undefined;
  }
  return last;
}

async function toGenerateTextResult<Tools extends ToolSet>(
  stream: StreamTextResult<Tools, unknown>,
  structuredOutput?: unknown,
): Promise<GenerateTextResult<Tools, unknown>> {
  return {
    content: await stream.content,
    text: await stream.text,
    reasoning: await stream.reasoning,
    reasoningText: await stream.reasoningText,
    files: await stream.files,
    sources: await stream.sources,
    toolCalls: await stream.toolCalls,
    toolResults: await stream.toolResults,
    staticToolCalls: await stream.staticToolCalls,
    dynamicToolCalls: await stream.dynamicToolCalls,
    staticToolResults: await stream.staticToolResults,
    dynamicToolResults: await stream.dynamicToolResults,
    finishReason: await stream.finishReason,
    usage: await stream.usage,
    totalUsage: await stream.totalUsage,
    warnings: await stream.warnings,
    steps: await stream.steps,
    request: await stream.request,
    response: await stream.response,
    providerMetadata: await stream.providerMetadata,
    experimental_output: structuredOutput as never,
  } as unknown as GenerateTextResult<Tools, unknown>;
}
