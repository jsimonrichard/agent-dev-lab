import {
  Output,
  stepCountIs,
  streamText,
  type CoreMessage,
  type StreamTextResult,
  type ToolSet,
} from "ai";
import type { z } from "zod";

import { AdlError } from "../errors";
import { createId } from "../internal/ids";
import { serializeError } from "../internal/serialize-error";
import { inspectMessageStoreKind } from "../memory/inspect";
import { RunRecorder, withActiveSpan } from "../runtime/run-recorder";
import type { RuntimeServices } from "../runtime/types";
import { generateConversationTitle, isGeneratingConversationTitle } from "./conversation-title";
import { inspectLanguageModel, type AgentModelInfo } from "./inspect";
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
  TOutput = string,
> implements Agent<Context, Tools, TOutput> {
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

  get memoryKind(): string {
    return inspectMessageStoreKind(this.services.stores.message);
  }

  get modelInfo(): AgentModelInfo | null {
    return inspectLanguageModel(this.definition.model ?? this.services.defaults.model);
  }

  get titleWorkflowId(): string | null {
    return this.definition.titleWorkflow?.id ?? null;
  }

  run(input: AgentRunInput<Context>): AgentRunHandle<Tools, TOutput> {
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
    } satisfies AgentRunHandle<Tools, TOutput>;
  }

  stream(input: AgentStreamInput<Context>): AgentStreamHandle<Tools, TOutput> {
    const controller = new AbortController();
    const agentCallId = createId();
    const streamReady = Promise.withResolvers<StreamTextResult<Tools, TOutput>>();

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
      ) as AgentStreamResult<Tools, TOutput>["textStream"],
      fullStream: lazyFullStream(
        () => streamReady.promise as unknown as Promise<StreamTextResult<ToolSet, unknown>>,
      ) as AgentStreamResult<Tools, TOutput>["fullStream"],
      finished,
      cancel: () => controller.abort(),
    } satisfies AgentStreamHandle<Tools, TOutput>;
  }

  private async executeEpisode(options: {
    input: AgentRunInput<unknown>;
    abortSignal: AbortSignal;
    exposeStream: boolean;
    agentCallId: string;
    onStreamReady?: (stream: StreamTextResult<Tools, TOutput>) => void;
  }): Promise<AgentRunResult<Tools, TOutput>> {
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

          const model = this.definition.model ?? this.services.defaults.model;
          if (!model) {
            throw new AdlError(
              "MISSING_MODEL",
              `Agent "${this.id}" has no model. Set agent.model or createAdlRuntime({ defaults: { model } }).`,
            );
          }

          const outputSchema = input.outputSchema ?? this.definition.outputSchema;
          const streamResult = streamText({
            model,
            ...(system ? { system } : {}),
            allowSystemInMessages: false,
            tools: { ...this.services.tools, ...this.definition.tools },
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
          }) as unknown as StreamTextResult<Tools, TOutput>;

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

          const persistedMessages = newMessages.length > 0 ? allMessages : storedMessages;

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
            total: persistedMessages.length,
          });

          const text = await streamResult.text;
          const output = outputSchema
            ? (outputSchema.parse(await structuredPromise) as TOutput)
            : (text as TOutput);
          const sdk = streamResult;

          if (!isGeneratingConversationTitle()) {
            await this.maybeSetConversationTitle({
              runRecorder,
              agentCallId,
              workflowRunId,
              stepId,
              memoryScope: input.memoryScope,
              isFirstTurn: storedMessages.length === 0 && turnMessages.length > 0,
              messages: allMessages,
            });
          }

          await runRecorder.emit({
            type: "agent_finished",
            agentCallId,
            workflowRunId,
            stepId,
            agentId: this.definition.id,
          });

          return {
            text,
            output,
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

  private async maybeSetConversationTitle(options: {
    runRecorder: RunRecorder;
    agentCallId: string;
    workflowRunId: string | undefined;
    stepId: string | null;
    memoryScope: string;
    isFirstTurn: boolean;
    messages: CoreMessage[];
  }): Promise<void> {
    const titleWorkflow = this.definition.titleWorkflow;
    if (!options.isFirstTurn || !titleWorkflow) {
      return;
    }

    try {
      const title = await generateConversationTitle(titleWorkflow, options.messages);
      if (!title) {
        return;
      }
      await options.runRecorder.emit({
        type: "agent_title_set",
        agentCallId: options.agentCallId,
        workflowRunId: options.workflowRunId,
        stepId: options.stepId,
        memoryScope: options.memoryScope,
        title,
      });
    } catch {
      // Title generation is best-effort and must not fail the conversation turn.
    }
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
