import type { ModelMessage } from "ai";

export type AssistantEndPart = "text" | "tool-call" | "none";

/**
 * Count `tool-call` parts on assistant messages produced in one model request.
 */
export function countToolCallParts(messages: ModelMessage[]): number {
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
export function hasAssistantText(messages: ModelMessage[]): boolean {
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
export function lastAssistantEndPart(messages: ModelMessage[]): AssistantEndPart {
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
