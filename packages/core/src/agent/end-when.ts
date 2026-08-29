import type { CoreMessage } from "ai";

import { DEFAULT_AGENT_END_WHEN, type AgentEndWhen } from "./types";

export type AssistantEndPart = "text" | "tool-call" | "none";

export type EvaluateEndWhenOptions = {
  aggregatedText?: string;
  endWhen?: AgentEndWhen;
  /** Full conversation after this request; used by predicate `endWhen`. */
  messages?: CoreMessage[];
  /** Conversation as sent to this request; used by predicate `endWhen`. */
  oldMessages?: CoreMessage[];
};

/**
 * Count `tool-call` parts on assistant messages produced in one model request.
 */
export function countToolCallParts(messages: CoreMessage[]): number {
  let count = 0;
  for (const message of messages) {
    if (message.role !== "assistant" || !Array.isArray(message.content)) {
      continue;
    }
    for (const part of message.content) {
      if (
        typeof part === "object" &&
        part !== null &&
        "type" in part &&
        part.type === "tool-call"
      ) {
        count += 1;
      }
    }
  }
  return count;
}

/**
 * True when assistant messages include non-empty user-facing text.
 * Ignores tool/reasoning parts and whitespace-only strings.
 */
export function hasAssistantText(messages: CoreMessage[]): boolean {
  for (const message of messages) {
    if (message.role !== "assistant") {
      continue;
    }
    if (typeof message.content === "string") {
      if (message.content.trim()) {
        return true;
      }
      continue;
    }
    if (!Array.isArray(message.content)) {
      continue;
    }
    for (const part of message.content) {
      if (isNonEmptyTextPart(part)) {
        return true;
      }
    }
  }
  return false;
}

function isNonEmptyTextPart(part: unknown): boolean {
  return (
    typeof part === "object" &&
    part !== null &&
    "type" in part &&
    part.type === "text" &&
    "text" in part &&
    typeof part.text === "string" &&
    Boolean(part.text.trim())
  );
}

/**
 * Last user-facing assistant part in request order: non-empty text or a tool call.
 * Tool-result messages and reasoning parts are ignored.
 */
export function lastAssistantEndPart(messages: CoreMessage[]): AssistantEndPart {
  let last: AssistantEndPart = "none";
  for (const message of messages) {
    if (message.role !== "assistant") {
      continue;
    }
    if (typeof message.content === "string") {
      if (message.content.trim()) {
        last = "text";
      }
      continue;
    }
    if (!Array.isArray(message.content)) {
      continue;
    }
    for (const part of message.content) {
      if (isNonEmptyTextPart(part)) {
        last = "text";
      } else if (
        typeof part === "object" &&
        part !== null &&
        "type" in part &&
        part.type === "tool-call"
      ) {
        last = "tool-call";
      }
    }
  }
  return last;
}

function oldMessagesFrom(messages: CoreMessage[], newMessages: CoreMessage[]): CoreMessage[] {
  if (newMessages.length === 0 || messages.length < newMessages.length) {
    return [];
  }
  const start = messages.length - newMessages.length;
  const tail = messages.slice(start);
  if (tail.every((message, index) => message === newMessages[index])) {
    return messages.slice(0, start);
  }
  return [];
}

/**
 * Whether this turn should stop, given {@link AgentEndWhen}.
 * A predicate `endWhen` should return `true` to stop.
 */
export function evaluateEndWhen(
  newMessages: CoreMessage[],
  options?: EvaluateEndWhenOptions,
): boolean {
  const endWhen = options?.endWhen ?? DEFAULT_AGENT_END_WHEN;
  if (typeof endWhen === "function") {
    const messages = options?.messages ?? newMessages;
    return endWhen({
      messages,
      oldMessages: options?.oldMessages ?? oldMessagesFrom(messages, newMessages),
      newMessages,
    });
  }
  switch (endWhen) {
    case "api-call-ends":
      return true;
    case "no-tool-calls":
      return countToolCallParts(newMessages) === 0;
    case "has-text":
      if (countToolCallParts(newMessages) === 0) {
        return true;
      }
      if (options?.aggregatedText?.trim()) {
        return true;
      }
      return hasAssistantText(newMessages);
    case "ends-with-text":
      return lastAssistantEndPart(newMessages) !== "tool-call";
  }
}
