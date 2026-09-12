import { Output, streamText, type ModelMessage, type StreamTextResult, type ToolSet } from "ai";

import { createAsyncChannel, type AsyncChannel } from "../async-channel";
import { AdlError } from "../errors";
import { linkAbortController, abortError, throwIfAborted } from "../internal/abort";
import { createId } from "../internal/ids";
import { serializeError } from "../internal/serialize-error";
import { withProjectVersionTag } from "../project/version-tag";
import { inspectMessageStoreKind } from "../stores/inspect";
import type { Result } from "../result";
import { RunRecorder, withActiveSpan } from "../runtime/run-recorder";
import type { RuntimeServices } from "../runtime/types";
import { generateConversationTitle, isGeneratingConversationTitle } from "./conversation-title";
import { inspectLanguageModel, type AgentModelInfo } from "./inspect";
import type { ToolProvider } from "../tools/provider";
import { invokeToolProviderOnRunEnd } from "../tools/provider";
import { buildToolProviderContext, resolveAgentTools } from "../tools/resolve-agent-tools";
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
  ToolProviderContext = undefined,
  Tools extends ToolSet = ToolSet,
  TOutput = string,
> implements Agent<ToolProviderContext, Tools, TOutput> {
  readonly id: string;

  constructor(
    readonly definition: AgentDefinition<ToolProviderContext, Tools, TOutput>,
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

  get tools(): Tools | ToolProvider<Tools, ToolProviderContext> | undefined {
    return this.definition.tools;
  }

  run(input: AgentRunInput<ToolProviderContext>): AgentRunHandle<Tools, TOutput> {
    const controller = linkAbortController(this.services.workflowContextScope.peek()?.signal);
    const agentCallId = createId();
    const memoryScope = resolveMemoryScope(input.memoryScope);
    const finished = this.executeTurn({
      input: { ...input, memoryScope },
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

  stream(input: AgentStreamInput<ToolProviderContext>): AgentStreamHandle<Tools, TOutput> {
    const controller = linkAbortController(this.services.workflowContextScope.peek()?.signal);
    const agentCallId = createId();
    const memoryScope = resolveMemoryScope(input.memoryScope);
    const textChannel = createAsyncChannel<string>();
    const fullChannel = createAsyncChannel<FullStreamPart>();

    const finished = this.executeTurn({
      input: { ...input, memoryScope },
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
    input: AgentRunInput<ToolProviderContext> & { memoryScope: string };
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
          tags: withProjectVersionTag(input.tags, this.services.version),
        });

        const toolCtx = buildToolProviderContext({
          agentId: this.definition.id,
          agentCallId,
          memoryScope,
          projectRoot: this.services.projectRoot,
          toolProviderContext: input.toolProviderContext,
          ...(workflowRunId ? { workflow: { workflowRunId, stepId } } : {}),
        });

        let turnError: unknown;
        let turnResult: AgentRunResult<Tools, TOutput> | undefined;
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

          const { tools, toolProviderContext } = await resolveAgentTools({
            agentId: this.definition.id,
            agentCallId,
            definitionTools: this.definition.tools,
            memoryScope,
            projectRoot: this.services.projectRoot,
            runtimeTools: this.services.tools,
            inputTools: input.tools,
            toolProviderContext: input.toolProviderContext,
            ...(workflowRunId ? { workflow: { workflowRunId, stepId } } : {}),
          });
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
            tools,
            messages: messages.filter(
              (message): message is Exclude<ModelMessage, { role: "system" }> =>
                message.role !== "system",
            ),
            experimental_context: toolProviderContext,
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
                    schema: outputSchema,
                  }),
                }
              : {}),
            onStepFinish: async (step) => {
              await persistResponseMessages(step.response.messages);
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
                  preliminary: chunk.preliminary,
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
            for await (const part of streamResult.fullStream) {
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

          turnResult = {
            text: lastText,
            output: lastOutput,
            messages,
            newMessages: allNewMessages,
            turns,
            memoryScope,
            sdk: lastSdk,
          };
        } catch (error) {
          turnError = abortSignal.aborted ? abortError(abortSignal) : error;
          await runRecorder.emit({
            type: "agent_failed",
            agentCallId,
            workflowRunId,
            stepId,
            agentId: this.definition.id,
            error: serializeError(error),
          });
        } finally {
          try {
            await invokeToolProviderOnRunEnd([this.definition.tools, input.tools], toolCtx);
          } catch (onRunEndError) {
            // Prefer the turn's own failure; surface onRunEnd only when the turn succeeded.
            if (turnError === undefined) {
              turnError = onRunEndError;
            }
          }
        }
        if (turnError !== undefined) {
          throw turnError;
        }
        if (turnResult === undefined) {
          throw new Error(
            `Agent "${this.id}" finished without a result or error (invariant broken).`,
          );
        }
        return turnResult;
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
        agentId: this.definition.id,
        memoryScope: options.memoryScope,
        title,
      });
    } catch {
      // Title generation is best-effort and must not fail the conversation turn.
    }
  }
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
