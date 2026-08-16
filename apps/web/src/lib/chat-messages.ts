import type { CoreMessage } from "@agent-dev-lab/core";

import type { ChatMessagePart, ChatToolResultPart, JsonValue, MockMessage } from "./mock/types";

type UnknownPart = {
  type?: unknown;
  text?: unknown;
  toolCallId?: unknown;
  toolName?: unknown;
  input?: unknown;
  args?: unknown;
  output?: unknown;
  result?: unknown;
  isError?: unknown;
  error?: unknown;
};

export function messageParts(message: MockMessage): ChatMessagePart[] {
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

export function collectToolResults(messages: MockMessage[]): Map<string, ChatToolResultPart> {
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

export function collectToolCallIds(messages: MockMessage[]): Set<string> {
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

/** Tool-role messages whose results already attach to an assistant tool-call. */
export function isPairedToolMessage(message: MockMessage, callIds: Set<string>): boolean {
  if (message.role !== "tool") {
    return false;
  }
  const results = messageParts(message).filter(
    (part): part is ChatToolResultPart => part.type === "tool-result",
  );
  return results.length > 0 && results.every((part) => callIds.has(part.toolCallId));
}

export function coreMessageToMock(message: CoreMessage, index: number): MockMessage {
  const role: MockMessage["role"] =
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

export function mockMessageToCore(message: MockMessage): CoreMessage {
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
        args: asJsonValue(part.input ?? part.args),
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
