import {
  NoObjectGeneratedError,
  Output,
  stepCountIs,
  streamText,
  type LanguageModel,
  type ModelMessage,
  type ToolSet,
} from "ai";
import type { z } from "zod";

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
import { sumTokenUsage, toTokenUsage, type TokenUsage } from "../observability/token-usage";
import { generateConversationTitle, isGeneratingConversationTitle } from "./conversation-title";
import { retryDroppedProviderStream } from "./retry-dropped-stream";
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
  type AgentSdkStreamResult,
} from "./types";

type FullStreamPart =
  AgentSdkStreamResult["fullStream"] extends AsyncIterable<infer Part> ? Part : never;

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
    // Omit when unset so streamText keeps its own defaults: maxRetries 2,
    // streamRetries off (which also keeps incremental tool streaming).
    const maxRetries = input.maxRetries ?? this.definition.maxRetries;
    const streamRetries = input.streamRetries ?? this.definition.streamRetries;

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

        const model = input.model ?? this.definition.model ?? this.services.defaults.model;
        const modelInfo = inspectLanguageModel(model);

        await runRecorder.emit({
          type: "agent_started",
          agentCallId,
          workflowRunId,
          stepId,
          agentId: this.definition.id,
          memoryScope,
          tags: withProjectVersionTag(input.tags, this.services.version),
          ...(modelInfo
            ? {
                modelId: modelInfo.modelId,
                ...(modelInfo.provider !== undefined ? { provider: modelInfo.provider } : {}),
              }
            : {}),
          ...(input.toolProviderContext !== undefined
            ? { toolProviderContext: input.toolProviderContext }
            : {}),
        });

        const recordEffect = runRecorder.emit.bind(runRecorder);
        const toolCtx = buildToolProviderContext({
          agentId: this.definition.id,
          agentCallId,
          memoryScope,
          projectRoot: this.services.projectRoot,
          toolProviderContext: input.toolProviderContext,
          recordEffect,
          ...(workflowRunId ? { workflow: { workflowRunId, stepId } } : {}),
        });

        let turnError: unknown;
        let turnResult: AgentRunResult<Tools, TOutput> | undefined;
        let streamError: unknown;
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

          // Conversation turns only — system text is passed via `streamText({ instructions })`
          // and pinned as the first stored message on a new memoryScope.
          let messages: ModelMessage[] = [...storedTranscript, ...turnMessages].filter(
            (message) => message.role !== "system",
          );
          const instructions = systemForEpisode.trim() ? systemForEpisode : undefined;

          if (!model) {
            throw new AdlError(
              "MISSING_MODEL",
              `Agent "${this.id}" has no model. Pass run({ model }), set agent.model, or createAdlRuntime({ defaults: { model } }).`,
            );
          }

          const outputSchema = input.outputSchema ?? this.definition.outputSchema;

          const { tools } = await resolveAgentTools({
            agentId: this.definition.id,
            agentCallId,
            definitionTools: this.definition.tools,
            memoryScope,
            projectRoot: this.services.projectRoot,
            runtimeTools: this.services.tools,
            inputTools: input.tools,
            toolProviderContext: input.toolProviderContext,
            recordEffect,
            ...(workflowRunId ? { workflow: { workflowRunId, stepId } } : {}),
          });
          const initialMessages = messages;
          let allNewMessages: ModelMessage[] = [];
          let lastPersisted = storedMessages;

          const pinnedSystem =
            storedSystemPrompt ??
            (isNewConversation && currentSystemPrompt.trim() ? currentSystemPrompt : null);

          const persistTranscript = async (conversationMessages: ModelMessage[]) => {
            const persistedMessages = pinnedSystem
              ? withStoredSystemPrompt(pinnedSystem, conversationMessages, {
                  agentId: storedAgentId ?? this.definition.id,
                })
              : conversationMessages;
            await messageStore.save(memoryScope, persistedMessages);
            lastPersisted = persistedMessages;
            return persistedMessages;
          };

          // Persist the user turn before the model runs so a title/SSE refresh
          // cannot observe an empty scope and wipe the first transcript row.
          if (turnMessages.length > 0) {
            await persistTranscript(messages);
          }

          // AI SDK 7: `step.response.messages` is per-step only (not cumulative).
          // Append each step's messages; do not replace the transcript.
          const persistResponseMessages = async (responseMessages: ModelMessage[]) => {
            let persistedMessages = lastPersisted;
            if (responseMessages.length > 0) {
              allNewMessages = [...allNewMessages, ...responseMessages];
              const conversationMessages = [...initialMessages, ...allNewMessages];
              persistedMessages = await persistTranscript(conversationMessages);
              messages = conversationMessages;
            }

            await runRecorder.emit({
              type: "agent_messages_committed",
              agentCallId,
              workflowRunId,
              stepId,
              memoryScope,
              count: responseMessages.length,
              total: persistedMessages.length,
            });
          };

          throwIfAborted(abortSignal);
          const streamed = await this.consumeModelStream({
            model,
            instructions,
            tools,
            messages,
            abortSignal,
            stopWhen,
            maxRetries,
            streamRetries,
            outputSchema: outputSchema as z.ZodType<TOutput> | undefined,
            agentCallId,
            workflowRunId,
            stepId,
            runRecorder,
            textChannel,
            fullChannel,
            persistResponseMessages,
            onStreamError: (error) => {
              streamError ??= error;
            },
          });

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
            ...(streamed.usage ? { usage: streamed.usage } : {}),
          });

          turnResult = {
            text: streamed.text,
            output: streamed.output,
            messages,
            newMessages: allNewMessages,
            turns: streamed.turns,
            memoryScope,
            sdk: streamed.sdk,
            ...(streamed.usage ? { usage: streamed.usage } : {}),
          };
        } catch (error) {
          turnError = abortSignal.aborted ? abortError(abortSignal) : (streamError ?? error);
          await runRecorder.emit({
            type: "agent_failed",
            agentCallId,
            workflowRunId,
            stepId,
            agentId: this.definition.id,
            error: serializeError(turnError),
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

  /**
   * Runs `streamText`, drains the stream, persists step messages via
   * `onStepEnd`, and returns the episode text/output/turns. Emit
   * `agent_finished` / title updates in the caller after this resolves.
   * `persistResponseMessages` may mutate caller message locals via closure.
   *
   * A schema and tools are not sent on the same model call. JSON response
   * format plus tools makes some models skip the tools and emit a minimal
   * object (Zod defaults then look like a successful empty result). The tool
   * loop is a normal text call. If it stops with schema JSON, that is the
   * result. If it stops with other text, one tool-free follow-up sends
   * `output`. A loop that stops on `tool-calls` fails with
   * `NoObjectGeneratedError` and does not run the follow-up.
   */
  private async consumeModelStream(options: {
    model: LanguageModel;
    instructions: string | undefined;
    tools: ToolSet | undefined;
    messages: ModelMessage[];
    abortSignal: AbortSignal;
    stopWhen: AgentStopWhen;
    maxRetries: number | undefined;
    streamRetries: number | undefined;
    outputSchema: z.ZodType<TOutput> | undefined;
    agentCallId: string;
    workflowRunId: string | undefined;
    stepId: string | null;
    runRecorder: RunRecorder;
    textChannel?: AsyncChannel<string>;
    fullChannel?: AsyncChannel<FullStreamPart>;
    persistResponseMessages: (responseMessages: ModelMessage[]) => Promise<void>;
    onStreamError: (error: unknown) => void;
  }): Promise<{
    text: string;
    output: TOutput;
    turns: number;
    sdk: AgentSdkStreamResult<Tools>;
    usage?: TokenUsage;
  }> {
    const { tools, messages, outputSchema, stopWhen, persistResponseMessages } = options;
    const separateStructuredOutput = outputSchema != null && toolSetHasTools(tools);

    let conversation = [...messages];
    const persistAndTrack = async (responseMessages: ModelMessage[]) => {
      await persistResponseMessages(responseMessages);
      if (responseMessages.length > 0) {
        conversation = [...conversation, ...responseMessages];
      }
    };

    const runStream = (stream: {
      messages: ModelMessage[];
      tools: ToolSet | undefined;
      outputSchema: z.ZodType<TOutput> | undefined;
      stopWhen: AgentStopWhen;
    }) =>
      this.streamModelCall({
        ...options,
        ...stream,
        persistResponseMessages: persistAndTrack,
      });

    const toolLoop = await runStream({
      messages: conversation,
      tools,
      outputSchema: separateStructuredOutput ? undefined : outputSchema,
      stopWhen,
    });

    if (!separateStructuredOutput || outputSchema == null) {
      return toolLoop;
    }

    const steps = await toolLoop.sdk.steps;
    const last = steps.at(-1);
    if (last == null) {
      throw new Error(`Agent "${this.id}" model stream produced no steps (invariant broken).`);
    }

    try {
      const output = (await Output.object({ schema: outputSchema }).parseCompleteOutput(
        { text: last.text },
        {
          response: last.response,
          usage: last.usage,
          finishReason: last.finishReason,
        },
      )) as TOutput;
      return { ...toolLoop, text: last.text, output };
    } catch (error) {
      // Only a normal stop with non-JSON text gets a format follow-up.
      // `tool-calls` means the step budget ended before an answer.
      if (!NoObjectGeneratedError.isInstance(error) || last.finishReason !== "stop") {
        throw error;
      }
    }

    await persistAndTrack([{ role: "user", content: STRUCTURED_OUTPUT_FOLLOW_UP }]);

    const formatted = await runStream({
      messages: conversation,
      tools: undefined,
      outputSchema,
      stopWhen: stepCountIs(1),
    });

    return {
      text: formatted.text,
      output: formatted.output,
      turns: toolLoop.turns + formatted.turns,
      sdk: formatted.sdk,
      usage: sumTokenUsage([toolLoop.usage, formatted.usage]),
    };
  }

  /**
   * One `streamText` call. `output` is set only when `outputSchema` is passed,
   * so a tool loop can omit it.
   */
  private async streamModelCall(options: {
    model: LanguageModel;
    instructions: string | undefined;
    tools: ToolSet | undefined;
    messages: ModelMessage[];
    abortSignal: AbortSignal;
    stopWhen: AgentStopWhen;
    maxRetries: number | undefined;
    streamRetries: number | undefined;
    outputSchema: z.ZodType<TOutput> | undefined;
    agentCallId: string;
    workflowRunId: string | undefined;
    stepId: string | null;
    runRecorder: RunRecorder;
    textChannel?: AsyncChannel<string>;
    fullChannel?: AsyncChannel<FullStreamPart>;
    persistResponseMessages: (responseMessages: ModelMessage[]) => Promise<void>;
    onStreamError: (error: unknown) => void;
  }): Promise<{
    text: string;
    output: TOutput;
    turns: number;
    sdk: AgentSdkStreamResult<Tools>;
    usage?: TokenUsage;
  }> {
    const {
      model,
      instructions,
      tools,
      messages,
      abortSignal,
      stopWhen,
      maxRetries,
      streamRetries,
      outputSchema,
      agentCallId,
      workflowRunId,
      stepId,
      runRecorder,
      textChannel,
      fullChannel,
      persistResponseMessages,
      onStreamError,
    } = options;
    const telemetry = this.services.telemetry;

    const runtimeContext: Record<string, string> = {
      "adl.agent_id": this.definition.id,
      "adl.agent_call_id": agentCallId,
      ...(workflowRunId ? { "adl.workflow_run_id": workflowRunId } : {}),
      ...(stepId ? { "adl.step_id": stepId } : {}),
      ...telemetry?.metadata,
    };
    const includeRuntimeContext = Object.fromEntries(
      Object.keys(runtimeContext).map((key) => [key, true as const]),
    );

    // streamText puts model failures on fullStream error parts and calls
    // onError; awaiting `.text` / `.steps` then rejects with
    // NoOutputGeneratedError ("check the stream for errors"). Keep the
    // onError payload so agent_failed records the model error, not the wrapper.
    // Tool provider context is closed over when tools are built — AI SDK 7 no
    // longer has a shared `experimental_context` blob on streamText.
    // streamText retries `{ type: "error" }` chunks only. A socket drop rejects
    // the provider stream; retry that inside doStream when the caller opted in.
    // String model ids are resolved inside streamText, so only model objects
    // can be wrapped. Callers in this repo pass model objects.
    const modelForStream =
      streamRetries !== undefined &&
      Number.isInteger(streamRetries) &&
      streamRetries > 0 &&
      typeof model === "object"
        ? retryDroppedProviderStream(model, streamRetries)
        : model;
    const streamResult = streamText({
      model: modelForStream,
      ...(instructions ? { instructions } : {}),
      allowSystemInMessages: false,
      tools,
      messages: messages.filter(
        (message): message is Exclude<ModelMessage, { role: "system" }> =>
          message.role !== "system",
      ),
      runtimeContext,
      abortSignal,
      stopWhen,
      ...(maxRetries !== undefined ? { maxRetries } : {}),
      ...(streamRetries !== undefined ? { streamRetries } : {}),
      onError: ({ error }) => {
        onStreamError(error);
      },
      telemetry: {
        isEnabled: telemetry?.isEnabled !== false,
        ...(telemetry?.recordInputs !== undefined ? { recordInputs: telemetry.recordInputs } : {}),
        ...(telemetry?.recordOutputs !== undefined
          ? { recordOutputs: telemetry.recordOutputs }
          : {}),
        functionId: telemetry?.functionId ?? this.definition.id,
        includeRuntimeContext,
      },
      ...(outputSchema
        ? {
            output: Output.object({
              schema: outputSchema,
            }),
          }
        : {}),
      onStepEnd: async (step) => {
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
    }) as unknown as AgentSdkStreamResult<Tools>;

    if (fullChannel) {
      for await (const part of streamResult.fullStream) {
        fullChannel.push(part);
      }
    } else {
      await streamResult.text;
    }

    const text = await streamResult.text;
    const turns = (await streamResult.steps).length;
    // `streamText`'s `output` promise parses the final step's complete text
    // (`parseCompleteOutput`) and rejects with `NoObjectGeneratedError` when
    // that text is not JSON matching the schema. `partialOutputStream` is a
    // repaired partial: after a tool loop its last value can be `{}` while
    // the model answered in prose, and `schema.parse({})` then fills every
    // `.default()`.
    const output = outputSchema ? ((await streamResult.output) as TOutput) : (text as TOutput);

    let usage: TokenUsage | undefined;
    try {
      usage = toTokenUsage(await streamResult.totalUsage);
    } catch {
      // Provider/SDK failed to report usage — finish the episode without fabricating counts.
      usage = undefined;
    }

    return {
      text,
      output,
      turns,
      sdk: streamResult,
      ...(usage ? { usage } : {}),
    };
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

function resolveMemoryScope(memoryScope: string | undefined): string {
  const trimmed = memoryScope?.trim();
  return trimmed ? trimmed : createId();
}

/** JSON response format is a separate call so the tool loop can still call tools. */
const STRUCTURED_OUTPUT_FOLLOW_UP = "Report the result as JSON matching the requested schema.";

function toolSetHasTools(tools: ToolSet | undefined): boolean {
  return tools != null && Object.keys(tools).length > 0;
}
