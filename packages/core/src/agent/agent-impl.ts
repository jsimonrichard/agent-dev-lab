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
import { linkAbortController, throwIfAborted } from "../internal/abort";
import { createId } from "../internal/ids";
import { serializeError } from "../internal/serialize-error";
import { inspectMessageStoreKind } from "../memory/inspect";
import type { Result } from "../result";
import { RunRecorder, withActiveSpan } from "../runtime/run-recorder";
import type { RuntimeServices } from "../runtime/types";
import { generateConversationTitle, isGeneratingConversationTitle } from "./conversation-title";
import { inspectLanguageModel, type AgentModelInfo } from "./inspect";
import {
  inspectSystemPrompt,
  inspectSystemPromptPath,
  resolveSystemPromptText,
  splitStoredSystemPrompt,
  withStoredSystemPrompt,
} from "./resolve-system-prompt";
import { evaluateEndWhen } from "./end-when";
import {
  DEFAULT_AGENT_END_WHEN,
  DEFAULT_AGENT_MAX_TURNS,
  type Agent,
  type AgentDefinition,
  type AgentEndWhen,
  type AgentRunHandle,
  type AgentRunInput,
  type AgentRunResult,
  type AgentStreamHandle,
  type AgentStreamInput,
  type AgentStreamResult,
} from "./types";

type FullStreamPart =
  StreamTextResult<ToolSet, unknown>["fullStream"] extends AsyncIterable<infer Part> ? Part : never;

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

  get endWhen(): AgentEndWhen {
    return this.definition.endWhen ?? DEFAULT_AGENT_END_WHEN;
  }

  get maxTurns(): number {
    return this.definition.maxTurns ?? DEFAULT_AGENT_MAX_TURNS;
  }

  get systemPrompt(): Result<string, string> {
    return inspectSystemPrompt(this.definition.systemPrompt);
  }

  get systemPromptPath(): string | null {
    return inspectSystemPromptPath(this.definition.systemPrompt);
  }

  run(input: AgentRunInput<Context>): AgentRunHandle<Tools, TOutput> {
    const controller = linkAbortController(this.services.workflowContextScope.peek()?.signal);
    const agentCallId = createId();
    const finished = this.executeTurn({
      input: input as AgentRunInput<unknown>,
      abortSignal: controller.signal,
      agentCallId,
    });
    return {
      agentCallId,
      result: finished,
      cancel: () => controller.abort(),
    } satisfies AgentRunHandle<Tools, TOutput>;
  }

  stream(input: AgentStreamInput<Context>): AgentStreamHandle<Tools, TOutput> {
    const controller = linkAbortController(this.services.workflowContextScope.peek()?.signal);
    const agentCallId = createId();
    const textChannel = createAsyncChannel<string>();
    const fullChannel = createAsyncChannel<FullStreamPart>();

    const finished = this.executeTurn({
      input: input as AgentRunInput<unknown>,
      abortSignal: controller.signal,
      agentCallId,
      textChannel,
      fullChannel,
    })
      .catch((error) => {
        textChannel.fail(error);
        fullChannel.fail(error);
        throw error;
      })
      .finally(() => {
        textChannel.close();
        fullChannel.close();
      });

    return {
      agentCallId,
      textStream: textChannel as unknown as AgentStreamResult<Tools, TOutput>["textStream"],
      fullStream: fullChannel as unknown as AgentStreamResult<Tools, TOutput>["fullStream"],
      finished,
      cancel: () => controller.abort(),
    } satisfies AgentStreamHandle<Tools, TOutput>;
  }

  private async executeTurn(options: {
    input: AgentRunInput<unknown>;
    abortSignal: AbortSignal;
    agentCallId: string;
    textChannel?: AsyncChannel<string>;
    fullChannel?: AsyncChannel<FullStreamPart>;
  }): Promise<AgentRunResult<Tools, TOutput>> {
    const { input, abortSignal, agentCallId, textChannel, fullChannel } = options;
    const messageStore = this.services.stores.message;

    const scope = this.services.workflowContextScope;
    const activeCtx = scope.peek();
    const workflowRunId = input.workflow?.workflowRunId ?? activeCtx?.workflowRunId;
    const stepId = input.workflow?.stepId ?? activeCtx?.stepId ?? null;
    const endWhen = input.endWhen ?? this.endWhen;
    const maxTurns = endWhen === "api-call-ends" ? 1 : Math.max(1, input.maxTurns ?? this.maxTurns);

    return withActiveSpan(
      "agent.turn",
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
          throwIfAborted(abortSignal);
          const storedMessages = await messageStore.load(input.memoryScope);
          const { systemPrompt: storedSystemPrompt, transcript: storedTranscript } =
            splitStoredSystemPrompt(storedMessages);
          const isNewConversation = storedMessages.length === 0;

          const turnMessages: CoreMessage[] = [];
          if (input.user) {
            turnMessages.push({ role: "user", content: input.user });
          }
          if (input.messages?.length) {
            turnMessages.push(...input.messages);
          }

          const currentSystemPrompt = resolveSystemPromptText(this.definition.systemPrompt);
          const systemForEpisode = storedSystemPrompt ?? currentSystemPrompt;

          // Conversation turns only — system text is passed via `streamText({ system })`
          // and pinned as the first stored message on a new memoryScope.
          let messages: CoreMessage[] = [...storedTranscript, ...turnMessages].filter(
            (message) => message.role !== "system",
          );
          const system = systemForEpisode.trim() ? systemForEpisode : undefined;

          const model = this.definition.model ?? this.services.defaults.model;
          if (!model) {
            throw new AdlError(
              "MISSING_MODEL",
              `Agent "${this.id}" has no model. Set agent.model or createAdlRuntime({ defaults: { model } }).`,
            );
          }

          const outputSchema = input.outputSchema ?? this.definition.outputSchema;
          const telemetry = this.services.telemetry;
          const allNewMessages: CoreMessage[] = [];
          let lastText = "";
          let lastOutput: TOutput | undefined;
          let lastSdk: StreamTextResult<Tools, TOutput> | undefined;
          let lastPersisted = storedMessages;
          let turns = 0;

          for (let turn = 0; turn < maxTurns; turn++) {
            throwIfAborted(abortSignal);
            const oldMessages = messages;
            const streamResult = streamText({
              model,
              ...(system ? { system } : {}),
              allowSystemInMessages: false,
              tools: { ...this.services.tools, ...this.definition.tools },
              messages: messages.filter(
                (message): message is Exclude<CoreMessage, { role: "system" }> =>
                  message.role !== "system",
              ),
              experimental_context: input.context,
              abortSignal,
              stopWhen: stepCountIs(1),
              experimental_telemetry: {
                isEnabled: telemetry?.isEnabled !== false,
                ...(telemetry?.recordInputs !== undefined
                  ? { recordInputs: telemetry.recordInputs }
                  : {}),
                ...(telemetry?.recordOutputs !== undefined
                  ? { recordOutputs: telemetry.recordOutputs }
                  : {}),
                functionId: telemetry?.functionId ?? this.definition.id,
                metadata: {
                  "adl.agent_id": this.definition.id,
                  "adl.agent_call_id": agentCallId,
                  ...(workflowRunId ? { "adl.workflow_run_id": workflowRunId } : {}),
                  ...(stepId ? { "adl.step_id": stepId } : {}),
                  ...telemetry?.metadata,
                },
              },
              ...(outputSchema
                ? {
                    experimental_output: Output.object({
                      schema: outputSchema as z.ZodType,
                    }),
                  }
                : {}),
              onChunk: ({ chunk }) => {
                if (chunk.type === "text-delta" && "text" in chunk) {
                  const delta = chunk.text;
                  textChannel?.push(delta);
                  void runRecorder.emit({
                    type: "agent_text_delta",
                    agentCallId,
                    workflowRunId,
                    stepId,
                    delta,
                  });
                }
                if (chunk.type === "tool-call") {
                  void runRecorder.emit({
                    type: "agent_tool_call",
                    agentCallId,
                    workflowRunId,
                    stepId,
                    agentId: this.definition.id,
                    toolCallId: chunk.toolCallId,
                    toolName: chunk.toolName,
                  });
                }
                if (chunk.type === "tool-result") {
                  void runRecorder.emit({
                    type: "agent_tool_result",
                    agentCallId,
                    workflowRunId,
                    stepId,
                    agentId: this.definition.id,
                    toolCallId: chunk.toolCallId,
                    toolName: chunk.toolName,
                    result: chunk.output,
                  });
                }
              },
            }) as unknown as StreamTextResult<Tools, TOutput>;

            const structuredPromise = outputSchema
              ? readStructuredOutputFromStream(
                  streamResult as unknown as StreamTextResult<ToolSet, unknown>,
                )
              : undefined;

            if (fullChannel) {
              for await (const part of streamResult.fullStream as AsyncIterable<FullStreamPart>) {
                fullChannel.push(part);
              }
            } else {
              await streamResult.text;
            }

            const responseMessages = (await streamResult.response).messages as CoreMessage[];
            const stepMessages = responseMessages.length > 0 ? responseMessages : [];
            const conversationMessages =
              stepMessages.length > 0 ? [...messages, ...stepMessages] : messages;

            const pinnedSystem =
              storedSystemPrompt ??
              (isNewConversation && currentSystemPrompt.trim() ? currentSystemPrompt : null);

            const persistedMessages =
              stepMessages.length > 0
                ? pinnedSystem
                  ? withStoredSystemPrompt(pinnedSystem, conversationMessages)
                  : conversationMessages
                : lastPersisted;

            if (stepMessages.length > 0) {
              await messageStore.save(input.memoryScope, persistedMessages);
              lastPersisted = persistedMessages;
              allNewMessages.push(...stepMessages);
              messages = conversationMessages;
            }

            await runRecorder.emit({
              type: "agent_messages_committed",
              agentCallId,
              workflowRunId,
              stepId,
              memoryScope: input.memoryScope,
              count: stepMessages.length,
              total: persistedMessages.length,
            });

            lastText = await streamResult.text;
            lastSdk = streamResult;
            turns += 1;

            const ended = evaluateEndWhen(stepMessages, {
              aggregatedText: lastText,
              endWhen,
              messages,
              oldMessages,
            });
            if (outputSchema && ended) {
              lastOutput = outputSchema.parse(await structuredPromise) as TOutput;
            } else {
              lastOutput = lastText as TOutput;
            }

            if (ended) {
              break;
            }
          }

          if (!isGeneratingConversationTitle()) {
            await this.maybeSetConversationTitle({
              runRecorder,
              agentCallId,
              workflowRunId,
              stepId,
              memoryScope: input.memoryScope,
              isFirstTurn: storedTranscript.length === 0 && turnMessages.length > 0,
              messages,
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
            text: lastText,
            output: lastOutput as TOutput,
            messages,
            newMessages: allNewMessages,
            turns,
            sdk: lastSdk as StreamTextResult<Tools, TOutput>,
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

type AsyncChannel<T> = {
  push(value: T): void;
  close(): void;
  fail(error: unknown): void;
  [Symbol.asyncIterator](): AsyncGenerator<T, void, unknown>;
};

function createAsyncChannel<T>(): AsyncChannel<T> {
  const buffer: T[] = [];
  const waiters: Array<{
    resolve: (result: IteratorResult<T>) => void;
    reject: (error: unknown) => void;
  }> = [];
  let closed = false;
  let failure: unknown;

  const settleWaiters = () => {
    while (waiters.length > 0 && (buffer.length > 0 || closed)) {
      const waiter = waiters.shift();
      if (!waiter) {
        break;
      }
      if (failure !== undefined) {
        waiter.reject(failure);
        continue;
      }
      if (buffer.length > 0) {
        waiter.resolve({ value: buffer.shift() as T, done: false });
        continue;
      }
      waiter.resolve({ value: undefined as T, done: true });
    }
  };

  return {
    push(value: T) {
      if (closed) {
        return;
      }
      buffer.push(value);
      settleWaiters();
    },
    close() {
      closed = true;
      settleWaiters();
    },
    fail(error: unknown) {
      failure = error;
      closed = true;
      settleWaiters();
    },
    async *[Symbol.asyncIterator]() {
      while (true) {
        if (buffer.length > 0) {
          yield buffer.shift() as T;
          continue;
        }
        if (failure !== undefined) {
          throw failure;
        }
        if (closed) {
          return;
        }
        const result = await new Promise<IteratorResult<T>>((resolve, reject) => {
          waiters.push({ resolve, reject });
        });
        if (result.done) {
          return;
        }
        yield result.value;
      }
    },
  };
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
