import type { CoreMessage } from "ai";

import { fromThrowable, type Result } from "../result";
import type { Template } from "../template/types";
import type { AgentSystemPrompt } from "./types";

/**
 * Resolve an agent's system prompt to plain text for the AI SDK `system` option.
 *
 * Templates render with their `demo` data when present, otherwise with an empty
 * object. On a new `memoryScope`, the resolved text is persisted as the first
 * stored message; later episodes reuse that pinned prompt.
 */
export function resolveSystemPromptText(systemPrompt: AgentSystemPrompt): string {
  if (typeof systemPrompt === "string") {
    return systemPrompt;
  }
  const template = systemPrompt as Template<unknown>;
  if (template.demo !== undefined) {
    return template.render(template.demo);
  }
  return template.render({} as never);
}

/**
 * Resolve a system prompt for inspectors without throwing. Invalid templates
 * (required Zod fields and no `demo`) become `{ isErr: true, error }` so catalog
 * loads still succeed and the UI can show the message.
 */
export function inspectSystemPrompt(systemPrompt: AgentSystemPrompt): Result<string, string> {
  return fromThrowable(() => resolveSystemPromptText(systemPrompt));
}

/** File path when `systemPrompt` is a file-backed template; otherwise `null`. */
export function inspectSystemPromptPath(systemPrompt: AgentSystemPrompt): string | null {
  if (typeof systemPrompt === "string") {
    return null;
  }
  const path = systemPrompt.path?.trim();
  return path ? path : null;
}

function readSystemMessageContent(message: CoreMessage): string | null {
  if (message.role !== "system") {
    return null;
  }
  if (typeof message.content === "string") {
    const text = message.content.trim();
    return text.length > 0 ? text : null;
  }
  return null;
}

/**
 * Split a stored transcript into an optional pinned system prompt (first message)
 * and the user/assistant/tool turns that follow.
 */
export function splitStoredSystemPrompt(messages: CoreMessage[]): {
  systemPrompt: string | null;
  transcript: CoreMessage[];
} {
  if (messages.length === 0) {
    return { systemPrompt: null, transcript: [] };
  }
  const first = messages[0];
  const systemPrompt = first ? readSystemMessageContent(first) : null;
  if (systemPrompt === null) {
    return {
      systemPrompt: null,
      transcript: messages.filter((message) => message.role !== "system"),
    };
  }
  return {
    systemPrompt,
    transcript: messages.slice(1).filter((message) => message.role !== "system"),
  };
}

/** Prepend a pinned system prompt to a transcript for {@link MessageStore.save}. */
export function withStoredSystemPrompt(
  systemPrompt: string,
  transcript: CoreMessage[],
): CoreMessage[] {
  const withoutSystem = transcript.filter((message) => message.role !== "system");
  const trimmed = systemPrompt.trim();
  if (!trimmed) {
    return withoutSystem;
  }
  return [{ role: "system", content: trimmed }, ...withoutSystem];
}
