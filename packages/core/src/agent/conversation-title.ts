import { AsyncLocalStorage } from "node:async_hooks";

import type { ModelMessage } from "ai";

import type { Workflow } from "../workflow/types";
import type { ConversationTitleInput, ConversationTitleOutput } from "./types";

const MAX_TITLE_LENGTH = 80;

/**
 * Re-entrancy guard for auto-title, not a UI flag.
 *
 * `titleWorkflow` may itself call `agent.run`. Without this ALS, that nested
 * episode would try to title *its* conversation, which can recurse. The store
 * is `true` only for the async subtree of {@link generateConversationTitle}.
 */
const titleGeneration = new AsyncLocalStorage<boolean>();

/** True while an agent's `titleWorkflow` is running (skip nested auto-title). */
export function isGeneratingConversationTitle(): boolean {
  return titleGeneration.getStore() === true;
}

export function runTitleGeneration<T>(fn: () => T): T {
  return titleGeneration.run(true, fn);
}

export function formatTranscriptForTitle(messages: ModelMessage[]): string {
  return messages
    .map((message) => {
      const role =
        message.role === "assistant"
          ? "Assistant"
          : message.role === "user"
            ? "User"
            : message.role;
      const text = modelMessageText(message);
      return text ? `${role}: ${text}` : "";
    })
    .filter((line) => line.length > 0)
    .join("\n\n");
}

export function sanitizeConversationTitle(raw: string): string | undefined {
  const firstLine = raw.split("\n")[0] ?? "";
  const stripped = firstLine
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!stripped) {
    return undefined;
  }
  return stripped.length > MAX_TITLE_LENGTH ? stripped.slice(0, MAX_TITLE_LENGTH).trim() : stripped;
}

export async function generateConversationTitle(
  titleWorkflow: Workflow<ConversationTitleInput, ConversationTitleOutput>,
  messages: ModelMessage[],
): Promise<string | undefined> {
  if (messages.length === 0) {
    return undefined;
  }

  return runTitleGeneration(async () => {
    // Isolated: own persisted run, not nested under the conversation's parent workflow.
    const output = await titleWorkflow.run({ messages }, { isolated: true }).result;
    return sanitizeConversationTitle(output.title);
  });
}

function modelMessageText(message: ModelMessage): string {
  if (typeof message.content === "string") {
    return message.content.trim();
  }
  if (!Array.isArray(message.content)) {
    return "";
  }
  return message.content
    .map((part) => {
      if (part && typeof part === "object" && "type" in part && part.type === "text") {
        return "text" in part && typeof part.text === "string" ? part.text : "";
      }
      return "";
    })
    .join("")
    .trim();
}
