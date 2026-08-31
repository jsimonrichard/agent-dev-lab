import { Output, streamText, type ModelMessage, type StreamTextResult, type ToolSet } from "ai";
import type { z } from "zod";

import { AdlError } from "../errors";
import { linkAbortController, abortError, throwIfAborted } from "../internal/abort";
import { createId } from "../internal/ids";
import { serializeError } from "../internal/serialize-error";
import { inspectMessageStoreKind } from "../stores/inspect";
import type { Result } from "../result";
import { RunRecorder, withActiveSpan } from "../runtime/run-recorder";
import type { RuntimeServices } from "../runtime/types";
import { generateConversationTitle, isGeneratingConversationTitle } from "./conversation-title";
import { inspectLanguageModel, type AgentModelInfo } from "./inspect";
import {
  formatSystemPromptConflictWarning,
  inspectSystemPrompt,
  inspectSystemPromptPath,
  resolveEpisodeSystemPrompt,
  resolveSystemPromptText,
  splitStoredSystemPrompt,
  withStoredSystemPrompt,
} from "./resolve-system-prompt";
import {
  DEFAULT_AGENT_STOP_WHEN,
  type Agent,
  type AgentDefinition,
  type AgentRunHandle,
  type AgentRunInput,
  type AgentRunResult,
  type AgentStopWhen,
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

  get stopWhen(): AgentStopWhen {
    return this.definition.stopWhen ?? DEFAULT_AGENT_STOP_WHEN;
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
    const memoryScope = resolveMemoryScope(input.memoryScope);
    const finished = this.executeTurn({
      input: { ...(input as AgentRunInput<unknown>), memoryScope },
      abortSignal: controller.signal,
      agentCallId,
      memoryScope,
    });
    return {
      agentCallId,
      memoryScope,
      result: finished,
      cancel: () => controller.abort(),
    } satisfies AgentRunHandle<Tools, TOutput>;
  }

  stream(input: AgentStreamInput<Context>): AgentStreamHandle<Tools, TOutput> {
    const controller = linkAbortController(this.services.workflowContextScope.peek()?.signal);
    const agentCallId = createId();
    const memoryScope = resolveMemoryScope(input.memoryScope);
    const textChannel = createAsyncChannel<string>();
    const fullChannel = createAsyncChannel<FullStreamPart>();

    const finished = this.executeTurn({
      input: { ...(input as AgentRunInput<unknown>), memoryScope },
      abortSignal: controller.signal,
      agentCallId,
      memoryScope,
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
      memoryScope,
      textStream: textChannel as unknown as AgentStreamResult<Tools, TOutput>["textStream"],
      fullStream: fullChannel as unknown as AgentStreamResult<Tools, TOutput>["fullStream"],
      finished,
      cancel: () => controller.abort(),
    } satisfies AgentStreamHandle<Tools, TOutput>;
  }

  private async executeTurn(options: {
    input: AgentRunInput<unknown> & { memoryScope: string };
    abortSignal: AbortSignal;
    agentCallId: string;
    memoryScope: string;
    textChannel?: AsyncChannel<string>;
    fullChannel?: AsyncChannel<FullStreamPart>;
  }): Promise<AgentRunResult<Tools, TOutput>> {
    const { input, abortSignal, agentCallId, memoryScope, textChannel, fullChannel } = options;
    const messageStore = this.services.stores.message;

    const scope = this.services.workflowContextScope;
    const activeCtx = scope.peek();
    const workflowRunId = input.workflow?.workflowRunId ?? activeCtx?.workflowRunId;
    const stepId = input.workflow?.stepId ?? activeCtx?.stepId ?? null;
    const stopWhen = input.stopWhen ?? this.stopWhen;

    return withActiveSpan(
      "agent.turn",
      {
        "adl.agent_id": this.definition.id,
        "adl.agent_call_id": agentCallId,
        "adl.memory_scope": memoryScope,
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
          memoryScope,
        });

        try {
          throwIfAborted(abortSignal);
          const storedMessages = await messageStore.load(memoryScope);
          const {
            systemPrompt: storedSystemPrompt,
            agentId: storedAgentId,
            transcript: storedTranscript,
          } = splitStoredSystemPrompt(storedMessages);
          const isNewConversation = storedMessages.length === 0;

          const turnMessages: ModelMessage[] = [];
          if (input.user) {
            turnMessages.push({ role: "user", content: input.user });
          }
          if (input.messages?.length) {
            turnMessages.push(...input.messages);
          }

          const currentSystemPrompt = resolveSystemPromptText(this.definition.systemPrompt);
          const strategy = input.systemPromptConflict ?? "keep-pinned";
          const { systemPrompt: systemForEpisode, conflict } = resolveEpisodeSystemPrompt({
            storedSystemPrompt,
            currentSystemPrompt,
            storedAgentId,
            currentAgentId: this.definition.id,
            strategy,
          });
          if (conflict && !input.suppressSystemPromptConflictWarning) {
            const warningMessage = formatSystemPromptConflictWarning({
              agentId: this.definition.id,
              scopeAgentId: storedAgentId ?? "unknown",
              memoryScope,
              strategy,
            });
            console.warn(warningMessage);
            await runRecorder.emit({
              type: "agent_warning",
              agentCallId,
              workflowRunId,
              stepId,
              agentId: this.definition.id,
              memoryScope,
              code: "system_prompt_conflict",
              message: warningMessage,
            });
          }

          // Conversation turns only — system text is passed via `streamText({ system })`
          // and pinned as the first stored message on a new memoryScope.
          let messages: ModelMessage[] = [...storedTranscript, ...turnMessages].filter(
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
          const initialMessages = messages;
          let allNewMessages: ModelMessage[] = [];
          let lastPersisted = storedMessages;
          let committedFromResponse = 0;

          const pinnedSystem =
            storedSystemPrompt ??
            (isNewConversation && currentSystemPrompt.trim() ? currentSystemPrompt : null);

          const persistResponseMessages = async (responseMessages: ModelMessage[]) => {
            const stepMessages = responseMessages.slice(committedFromResponse);
            committedFromResponse = responseMessages.length;
            const conversationMessages =
              responseMessages.length > 0 ? [...initialMessages, ...responseMessages] : messages;
            const persistedMessages =
              responseMessages.length > 0
                ? pinnedSystem
                  ? withStoredSystemPrompt(pinnedSystem, conversationMessages, {
                      agentId: storedAgentId ?? this.definition.id,
                    })
                  : conversationMessages
                : lastPersisted;

            if (responseMessages.length > 0) {
              await messageStore.save(memoryScope, persistedMessages);
              lastPersisted = persistedMessages;
              allNewMessages = responseMessages;
              messages = conversationMessages;
            }

            await runRecorder.emit({
              type: "agent_messages_committed",
              agentCallId,
              workflowRunId,
              stepId,
              memoryScope,
              count: stepMessages.length,
              total: persistedMessages.length,
            });
          };

          throwIfAborted(abortSignal);
          const streamResult = streamText({
            model,
            ...(system ? { system } : {}),
            allowSystemInMessages: false,
            tools: { ...this.services.tools, ...this.definition.tools },
            messages: messages.filter(
              (message): message is Exclude<ModelMessage, { role: "system" }> =>
                message.role !== "system",
            ),
            experimental_context: input.context,
            abortSignal,
            stopWhen,
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
            onStepFinish: async (step) => {
              await persistResponseMessages(step.response.messages as ModelMessage[]);
            },
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

          const lastText = await streamResult.text;
          const lastSdk = streamResult;
          const turns = (await streamResult.steps).length;
          const lastOutput = outputSchema
            ? (outputSchema.parse(await structuredPromise) as TOutput)
            : (lastText as TOutput);

          if (!isGeneratingConversationTitle()) {
            await this.maybeSetConversationTitle({
              runRecorder,
              agentCallId,
              workflowRunId,
              stepId,
              memoryScope,
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
            memoryScope,
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
          if (abortSignal.aborted) {
            throw abortError(abortSignal);
          }
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
    messages: ModelMessage[];
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

function resolveMemoryScope(memoryScope: string | undefined): string {
  const trimmed = memoryScope?.trim();
  return trimmed ? trimmed : createId();
}
