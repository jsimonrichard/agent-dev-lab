import {
  Output,
  stepCountIs,
  streamText,
  type CoreMessage,
  type StreamTextResult,
  type ToolSet,
} from "ai";
import type { z } from "zod";

import { createId } from "../internal/ids";
import { serializeError } from "../internal/serialize-error";
import { RunRecorder, withActiveSpan } from "../runtime/run-recorder";
import type { RuntimeServices } from "../runtime/types";
import { resolveInstructionsText } from "./resolve-instructions";
import type {
  Agent,
  AgentDefinition,
  AgentRunHandle,
  AgentRunInput,
  AgentRunResult,
  AgentStreamHandle,
  AgentStreamInput,
  AgentStreamResult,
} from "./types";

/**
 * Default agent implementation: definition plus resolved runtime services.
 */
export class AgentImpl<
  Context = undefined,
  Tools extends ToolSet = ToolSet,
  TOutput = unknown,
> implements Agent<Context, Tools> {
  readonly id: string;

  constructor(
    readonly definition: AgentDefinition<Tools, TOutput>,
    readonly services: RuntimeServices,
  ) {
    if (!definition.id || typeof definition.id !== "string") {
      throw new Error('AgentImpl: "id" must be a non-empty string');
    }
    this.id = definition.id;
  }

  run(input: AgentRunInput<Context>): AgentRunHandle<Tools> {
    const controller = new AbortController();
    const agentCallId = createId();
    const finished = this.executeEpisode({
      input: input as AgentRunInput<unknown>,
      abortSignal: controller.signal,
      exposeStream: false,
      agentCallId,
    });
    return {
      agentCallId,
      result: finished,
      cancel: () => controller.abort(),
    } satisfies AgentRunHandle<Tools>;
  }

  stream(input: AgentStreamInput<Context>): AgentStreamHandle<Tools> {
    const controller = new AbortController();
    const agentCallId = createId();
    const streamReady = Promise.withResolvers<StreamTextResult<Tools, unknown>>();

    const finished = this.executeEpisode({
      input: input as AgentRunInput<unknown>,
      abortSignal: controller.signal,
      exposeStream: true,
      agentCallId,
      onStreamReady: (stream) => streamReady.resolve(stream),
    }).catch((error) => {
      streamReady.reject(error);
      throw error;
    });

    return {
      agentCallId,
      textStream: lazyTextStream(
        () => streamReady.promise as unknown as Promise<StreamTextResult<ToolSet, unknown>>,
      ) as AgentStreamResult<Tools, unknown>["textStream"],
      fullStream: lazyFullStream(
        () => streamReady.promise as unknown as Promise<StreamTextResult<ToolSet, unknown>>,
      ) as AgentStreamResult<Tools, unknown>["fullStream"],
      finished,
      cancel: () => controller.abort(),
    } satisfies AgentStreamHandle<Tools>;
  }

  private async executeEpisode(options: {
    input: AgentRunInput<unknown>;
    abortSignal: AbortSignal;
    exposeStream: boolean;
    agentCallId: string;
    onStreamReady?: (stream: StreamTextResult<Tools, unknown>) => void;
  }): Promise<AgentRunResult<Tools>> {
    const { input, abortSignal, exposeStream, onStreamReady, agentCallId } = options;
    const messageStore = this.services.stores.message;

    const scope = this.services.workflowContextScope;
    const activeCtx = scope.peek();
    const workflowRunId = input.workflow?.workflowRunId ?? activeCtx?.workflowRunId;
    const stepId = input.workflow?.stepId ?? activeCtx?.stepId ?? null;

    return withActiveSpan(
      "agent.episode",
      {
        "adl.agent_id": this.definition.id,
        "adl.agent_call_id": agentCallId,
        "adl.memory_scope": input.memoryScope,
        ...(workflowRunId ? { "adl.workflow_run_id": workflowRunId } : {}),
        ...(stepId ? { "adl.step_id": stepId } : {}),
      },
      async () => {
        const runRecorder = scope.peekRunRecorder() ?? new RunRecorder(this.services);

        await runRecorder.emit({
          type: "agent_started",
          agentCallId,
          workflowRunId,
          stepId,
          agentId: this.definition.id,
          memoryScope: input.memoryScope,
        });

        try {
          const storedMessages = await messageStore.load(input.memoryScope);

          const turnMessages: CoreMessage[] = [];
          if (input.user) {
            turnMessages.push({ role: "user", content: input.user });
          }
          if (input.messages?.length) {
            turnMessages.push(...input.messages);
          }

          // Instructions are passed via the AI SDK `system` option rather than as a
          // system message in `messages`. This avoids the SDK's system-in-messages
          // prompt-injection warning and keeps the MessageStore free of system text.
          // Any stray system messages (legacy stores, caller input) are dropped here.
          const messages = [...storedMessages, ...turnMessages].filter(
            (message) => message.role !== "system",
          );
          const system = resolveInstructionsText(this.definition.instructions);

          const outputSchema = input.outputSchema ?? this.definition.outputSchema;
          const streamResult = streamText({
            model: this.definition.model,
            ...(system ? { system } : {}),
            tools: this.definition.tools,
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
              if ("type" in chunk && chunk.type === "text-delta" && "text" in chunk) {
                void runRecorder.emit({
                  type: "agent_text_delta",
                  agentCallId,
                  workflowRunId,
                  stepId,
                  delta: chunk.text,
                });
              }
            },
          }) as unknown as StreamTextResult<Tools, unknown>;

          onStreamReady?.(streamResult);

          const structuredPromise = outputSchema
            ? readStructuredOutputFromStream(
                streamResult as unknown as StreamTextResult<ToolSet, unknown>,
              )
            : undefined;

          if (!exposeStream) {
            await streamResult.text;
          }

          const responseMessages = (await streamResult.response).messages as CoreMessage[];
          const newMessages = responseMessages.length > 0 ? responseMessages : [];
          const allMessages = newMessages.length > 0 ? [...messages, ...newMessages] : messages;

          if (newMessages.length > 0) {
            await messageStore.save(input.memoryScope, allMessages);
          }

          await runRecorder.emit({
            type: "agent_messages_committed",
            agentCallId,
            workflowRunId,
            stepId,
            memoryScope: input.memoryScope,
            count: newMessages.length,
          });

          const text = await streamResult.text;
          const structuredOutput = structuredPromise ? await structuredPromise : undefined;
          const sdk = streamResult;

          await runRecorder.emit({
            type: "agent_finished",
            agentCallId,
            workflowRunId,
            stepId,
            agentId: this.definition.id,
          });

          return {
            text,
            output: structuredOutput as never,
            messages: allMessages,
            newMessages,
            sdk,
          };
        } catch (error) {
          await runRecorder.emit({
            type: "agent_failed",
            agentCallId,
            workflowRunId,
            stepId,
            agentId: this.definition.id,
            error: serializeError(error),
          });
          throw error;
        }
      },
    );
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

/** AI SDK exposes structured stream output only via partialOutputStream on streamText. */
async function readStructuredOutputFromStream(
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
