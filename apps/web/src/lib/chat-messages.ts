import type { CoreMessage } from "@agent-dev-lab/core";

import type {
  ChatMessagePart,
  ChatToolCallPart,
  ChatToolResultPart,
  JsonValue,
  InspectorMessage,
} from "./view-model/types";

type UnknownPart = {
  type?: unknown;
  text?: unknown;
  toolCallId?: unknown;
  toolName?: unknown;
  input?: unknown;
  args?: unknown;
  arguments?: unknown;
  output?: unknown;
  result?: unknown;
  isError?: unknown;
  error?: unknown;
  providerExecuted?: unknown;
};

export function messageParts(message: InspectorMessage): ChatMessagePart[] {
  if (message.parts && message.parts.length > 0) {
    return message.parts;
  }
  return message.content ? [{ type: "text", text: message.content }] : [];
}

export function messageText(parts: ChatMessagePart[]): string {
  return parts
    .filter((part): part is Extract<ChatMessagePart, { type: "text" }> => part.type === "text")
    .map((part) => part.text)
    .join("");
}

/** Pinned system prompt from the first stored message, when present. */
export function extractSystemPromptFromMessages(messages: InspectorMessage[]): string | null {
  const first = messages[0];
  if (!first || first.role !== "system") {
    return null;
  }
  const text = messageText(messageParts(first)).trim();
  return text.length > 0 ? text : null;
}

/** Transcript rows excluding pinned and stray system messages. */
export function conversationMessagesWithoutSystem(
  messages: InspectorMessage[],
): InspectorMessage[] {
  const rest = messages[0]?.role === "system" ? messages.slice(1) : messages;
  return rest.filter((message) => message.role !== "system");
}

/**
 * Keep the streaming assistant bubble visible until the persisted transcript includes
 * the assistant reply (avoids a gap when `isRunning` flips false before refresh).
 */
export function shouldShowStreamingAssistant(
  messages: InspectorMessage[],
  streamingText: string | undefined | null,
  options: { isRunning: boolean; sending: boolean },
): boolean {
  if (!streamingText?.trim()) {
    return false;
  }
  if (options.isRunning || options.sending) {
    return true;
  }
  return messages[messages.length - 1]?.role !== "assistant";
}

/** Prefer fresher local optimistic rows over a stale loader snapshot. */
export function mergeConversationMessages(
  local: InspectorMessage[],
  fromLoader: InspectorMessage[],
): InspectorMessage[] {
  if (fromLoader.length > local.length) {
    return fromLoader;
  }
  if (fromLoader.length === local.length && fromLoader.length > 0) {
    const loaderHasAssistant = fromLoader.some((message) => message.role === "assistant");
    const localHasAssistant = local.some((message) => message.role === "assistant");
    if (loaderHasAssistant && !localHasAssistant) {
      return fromLoader;
    }
    if (loaderHasAssistant && localHasAssistant) {
      return fromLoader;
    }
  }
  if (fromLoader.length >= local.length) {
    return fromLoader;
  }
  return local;
}

/** Keep stable React keys for optimistic user rows after refresh. */
export function reconcileFetchedMessages(
  fetched: InspectorMessage[],
  local: InspectorMessage[],
): InspectorMessage[] {
  const pendingUsers = local.filter(
    (message) => message.role === "user" && message.id.startsWith("pending-"),
  );
  if (pendingUsers.length === 0) {
    return fetched;
  }

  const claimed = new Set<string>();
  return fetched.map((message) => {
    if (message.role !== "user") {
      return message;
    }
    const pending = pendingUsers.find(
      (candidate) =>
        !claimed.has(candidate.id) &&
        candidate.content === message.content &&
        messageText(messageParts(candidate)) === messageText(messageParts(message)),
    );
    if (!pending) {
      return message;
    }
    claimed.add(pending.id);
    return { ...message, id: pending.id };
  });
}

export function collectToolResults(messages: InspectorMessage[]): Map<string, ChatToolResultPart> {
  const results = new Map<string, ChatToolResultPart>();
  for (const message of messages) {
    for (const part of messageParts(message)) {
      if (part.type === "tool-result") {
        results.set(part.toolCallId, part);
      }
    }
  }
  return results;
}

export function collectToolCallIds(messages: InspectorMessage[]): Set<string> {
  const ids = new Set<string>();
  for (const message of messages) {
    for (const part of messageParts(message)) {
      if (part.type === "tool-call") {
        ids.add(part.toolCallId);
      }
    }
  }
  return ids;
}

export type ChatDisplayTextItem = {
  type: "text";
  key: string;
  role: InspectorMessage["role"];
  text: string;
};

export type ChatDisplayJsonItem = {
  type: "json";
  key: string;
  role: InspectorMessage["role"];
  value: unknown;
};

export type ChatDisplayToolCallItem = {
  type: "tool-call";
  key: string;
  call: ChatToolCallPart;
  pending: boolean;
};

export type ChatDisplayToolResultItem = {
  type: "tool-result";
  key: string;
  result: ChatToolResultPart;
};

export type ChatDisplayItem =
  | ChatDisplayTextItem
  | ChatDisplayJsonItem
  | ChatDisplayToolCallItem
  | ChatDisplayToolResultItem;

const FENCED_JSON = /^```(?:json)?\s*([\s\S]*?)\s*```$/i;

/**
 * Parse an assistant turn as structured JSON (object or array). Accepts a raw
 * JSON payload or a single markdown ```json fence around one.
 */
export function parseStructuredJson(text: string): unknown | undefined {
  let candidate = text.trim();
  if (!candidate) {
    return undefined;
  }
  const fenced = candidate.match(FENCED_JSON);
  const fencedBody = fenced?.[1];
  if (fencedBody !== undefined) {
    candidate = fencedBody.trim();
  }
  if (!candidate.startsWith("{") && !candidate.startsWith("[")) {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(candidate);
    if (parsed !== null && typeof parsed === "object") {
      return parsed;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

/**
 * Flatten stored messages into transcript rows so tool calls and tool results
 * render as their own messages instead of nesting inside assistant bubbles.
 */
export function toChatDisplayItems(messages: InspectorMessage[]): ChatDisplayItem[] {
  const resultsById = collectToolResults(messages);
  const items: ChatDisplayItem[] = [];

  for (const message of messages) {
    const parts = messageParts(message);
    let textChunks: string[] = [];
    let textKey = `${message.id}-text-0`;

    const flushText = () => {
      const text = textChunks.join("");
      textChunks = [];
      if (!text.trim()) {
        return;
      }
      const json = message.role === "assistant" ? parseStructuredJson(text) : undefined;
      if (json !== undefined) {
        items.push({ type: "json", key: textKey, role: message.role, value: json });
        return;
      }
      items.push({ type: "text", key: textKey, role: message.role, text });
    };

    for (const [partIndex, part] of parts.entries()) {
      if (part.type === "text") {
        if (textChunks.length === 0) {
          textKey = `${message.id}-text-${partIndex}`;
        }
        if (part.text) {
          textChunks.push(part.text);
        }
        continue;
      }

      flushText();

      if (part.type === "tool-call") {
        const result = resultsById.get(part.toolCallId);
        items.push({
          type: "tool-call",
          key: `${message.id}-call-${part.toolCallId}`,
          call: resolveDisplayedToolCall(part, result),
          pending: result == null,
        });
        continue;
      }

      const call = findToolCall(messages, part.toolCallId);
      items.push({
        type: "tool-result",
        key: `${message.id}-result-${part.toolCallId || partIndex}`,
        result: resolveDisplayedToolResult(part, call),
      });
    }

    flushText();
  }

  return items;
}

export function coreMessageToInspector(message: CoreMessage, index: number): InspectorMessage {
  const role: InspectorMessage["role"] =
    message.role === "system" ||
    message.role === "user" ||
    message.role === "assistant" ||
    message.role === "tool"
      ? message.role
      : "assistant";
  const parts = partsFromContent(message.content);
  return {
    id: `msg-${index}`,
    role,
    content: messageText(parts),
    parts,
  };
}

export function inspectorMessageToCore(message: InspectorMessage): CoreMessage {
  const parts = messageParts(message);

  if (message.role === "tool") {
    return {
      role: "tool",
      content: parts.flatMap((part) =>
        part.type === "tool-result"
          ? [
              {
                type: "tool-result" as const,
                toolCallId: part.toolCallId,
                toolName: part.toolName,
                output: part.result,
              },
            ]
          : [],
      ),
    } as CoreMessage;
  }

  if (message.role === "assistant" && parts.some((part) => part.type !== "text")) {
    const content = [];
    for (const part of parts) {
      if (part.type === "text") {
        content.push({ type: "text" as const, text: part.text });
      } else if (part.type === "tool-call") {
        content.push({
          type: "tool-call" as const,
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          input: part.args,
        });
      }
    }
    return { role: "assistant", content } as CoreMessage;
  }

  if (message.role === "system") {
    return { role: "system", content: message.content };
  }

  if (message.role === "assistant") {
    return { role: "assistant", content: message.content };
  }

  return { role: "user", content: message.content };
}

function partsFromContent(content: unknown): ChatMessagePart[] {
  if (typeof content === "string") {
    return content ? [{ type: "text", text: content }] : [];
  }
  if (!Array.isArray(content)) {
    return content == null ? [] : [{ type: "text", text: JSON.stringify(content) }];
  }

  const parts: ChatMessagePart[] = [];
  for (const raw of content) {
    if (!raw || typeof raw !== "object") {
      continue;
    }
    const part = raw as UnknownPart;
    if (part.type === "text" && typeof part.text === "string") {
      if (part.text) {
        parts.push({ type: "text", text: part.text });
      }
      continue;
    }
    if (part.type === "tool-call") {
      parts.push({
        type: "tool-call",
        toolCallId: stringId(part.toolCallId),
        toolName: stringName(part.toolName),
        args: firstNonEmptyArgs(part.input, part.args, part.arguments),
        ...(part.providerExecuted === true ? { providerExecuted: true } : {}),
      });
      continue;
    }
    if (part.type === "tool-result") {
      parts.push({
        type: "tool-result",
        toolCallId: stringId(part.toolCallId),
        toolName: stringName(part.toolName),
        result: asJsonValue(part.output ?? part.result),
        isError: part.isError === true,
        ...(part.providerExecuted === true ? { providerExecuted: true } : {}),
      });
      continue;
    }
    if (part.type === "tool-error") {
      parts.push({
        type: "tool-result",
        toolCallId: stringId(part.toolCallId),
        toolName: stringName(part.toolName),
        result: asJsonValue(part.error ?? part.output ?? part.result),
        isError: true,
        ...(part.providerExecuted === true ? { providerExecuted: true } : {}),
      });
    }
  }
  return parts;
}

function stringId(value: unknown): string {
  return typeof value === "string" && value.length > 0 ? value : "unknown";
}

function stringName(value: unknown): string {
  return typeof value === "string" && value.length > 0 ? value : "tool";
}

function asJsonValue(value: unknown): JsonValue {
  return value as JsonValue;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

const TOOL_OUTPUT_ENVELOPE_TYPES = new Set(["text", "json", "error-text", "error-json", "content"]);

/** AI SDK tool results wrap the payload as `{ type: "json" | "text" | ..., value }`. */
export function unwrapToolResultOutput(output: unknown): unknown {
  if (!isRecord(output)) {
    return output;
  }
  if (
    typeof output.type === "string" &&
    TOOL_OUTPUT_ENVELOPE_TYPES.has(output.type) &&
    "value" in output
  ) {
    return output.value;
  }
  return output;
}

export function isEmptyToolArgs(value: unknown): boolean {
  if (value == null) {
    return true;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length === 0 || trimmed === "{}";
  }
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  if (typeof value === "object") {
    return Object.keys(value).length === 0;
  }
  return false;
}

function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return value;
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return value;
  }
}

function firstNonEmptyArgs(...candidates: unknown[]): JsonValue {
  for (const candidate of candidates) {
    const parsed = parseMaybeJson(candidate);
    if (!isEmptyToolArgs(parsed)) {
      return asJsonValue(parsed);
    }
  }
  return asJsonValue(candidates.find((value) => value !== undefined) ?? {});
}

function findToolCall(
  messages: InspectorMessage[],
  toolCallId: string,
): ChatToolCallPart | undefined {
  for (const message of messages) {
    for (const part of messageParts(message)) {
      if (part.type === "tool-call" && part.toolCallId === toolCallId) {
        return part;
      }
    }
  }
  return undefined;
}

/**
 * Hosted OpenAI tools (web_search) persist empty call input and put the model's
 * request on the result as `action`. Surface that as a pseudo tool-call.
 */
function hostedActionPayload(
  call: ChatToolCallPart | undefined,
  result: ChatToolResultPart | undefined,
): unknown {
  if (!result || (call && !isEmptyToolArgs(call.args))) {
    return undefined;
  }
  const hosted = call?.providerExecuted === true || result.providerExecuted === true;
  if (!hosted) {
    return undefined;
  }
  const unwrapped = unwrapToolResultOutput(result.result);
  if (isRecord(unwrapped) && unwrapped.action != null) {
    return unwrapped.action;
  }
  return undefined;
}

export function resolveDisplayedToolCall(
  call: ChatToolCallPart,
  result?: ChatToolResultPart,
): ChatToolCallPart {
  const action = hostedActionPayload(call, result);
  if (action === undefined) {
    return call;
  }
  return {
    ...call,
    args: asJsonValue(action),
    providerExecuted: true,
    providerAction: true,
  };
}

/** Unwrap the AI SDK result envelope; move hosted `action` onto the call row. */
export function resolveDisplayedToolResult(
  result: ChatToolResultPart,
  call?: ChatToolCallPart,
): ChatToolResultPart {
  const envelopeIsError =
    isRecord(result.result) &&
    (result.result.type === "error-text" || result.result.type === "error-json");
  const unwrapped = unwrapToolResultOutput(result.result);
  let displayed: unknown = unwrapped;

  if (hostedActionPayload(call, result) !== undefined && isRecord(unwrapped)) {
    const rest = { ...unwrapped };
    delete rest.action;
    const keys = Object.keys(rest);
    if (keys.length === 1 && "sources" in rest) {
      displayed = rest.sources;
    } else if (keys.length > 0) {
      displayed = rest;
    }
  }

  return {
    ...result,
    result: asJsonValue(displayed),
    isError: result.isError === true || envelopeIsError,
  };
}
