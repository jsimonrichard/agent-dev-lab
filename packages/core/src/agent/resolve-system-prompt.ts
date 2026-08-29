import type { CoreMessage } from "ai";

import { fromThrowable, type Result } from "../result";
import type { Template } from "../template/types";
import type { AgentSystemPrompt, SystemPromptConflictStrategy } from "./types";

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

/** `providerOptions` namespace used to record which agent owns a scope's pin. */
const ADL_PROVIDER = "adl";

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

function readStoredAgentId(message: CoreMessage): string | null {
  if (message.role !== "system") {
    return null;
  }
  const raw = message.providerOptions?.[ADL_PROVIDER]?.agentId;
  if (typeof raw !== "string") {
    return null;
  }
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Split a stored transcript into an optional pinned system prompt (first message)
 * and the user/assistant/tool turns that follow.
 */
export function splitStoredSystemPrompt(messages: CoreMessage[]): {
  systemPrompt: string | null;
  agentId: string | null;
  transcript: CoreMessage[];
} {
  if (messages.length === 0) {
    return { systemPrompt: null, agentId: null, transcript: [] };
  }
  const first = messages[0];
  const systemPrompt = first ? readSystemMessageContent(first) : null;
  if (systemPrompt === null) {
    return {
      systemPrompt: null,
      agentId: null,
      transcript: messages.filter((message) => message.role !== "system"),
    };
  }
  return {
    systemPrompt,
    agentId: first ? readStoredAgentId(first) : null,
    transcript: messages.slice(1).filter((message) => message.role !== "system"),
  };
}

/** Prepend a pinned system prompt to a transcript for {@link MessageStore.save}. */
export function withStoredSystemPrompt(
  systemPrompt: string,
  transcript: CoreMessage[],
  options?: { agentId?: string | null },
): CoreMessage[] {
  const withoutSystem = transcript.filter((message) => message.role !== "system");
  const trimmed = systemPrompt.trim();
  if (!trimmed) {
    return withoutSystem;
  }
  const agentId = options?.agentId?.trim();
  const pin: CoreMessage = agentId
    ? {
        role: "system",
        content: trimmed,
        providerOptions: { [ADL_PROVIDER]: { agentId } },
      }
    : { role: "system", content: trimmed };
  return [pin, ...withoutSystem];
}

export type ResolveEpisodeSystemPromptInput = {
  storedSystemPrompt: string | null;
  currentSystemPrompt: string;
  storedAgentId?: string | null;
  currentAgentId: string;
  strategy?: SystemPromptConflictStrategy;
};

export type ResolveEpisodeSystemPromptResult = {
  /** Text passed to the AI SDK `system` option for this episode. */
  systemPrompt: string;
  /**
   * True only when a *different* agent hits a scope whose pinned prompt
   * differs from this agent's. Same-agent follow-ups (including a hot-reloaded
   * definition) are not a conflict.
   */
  conflict: boolean;
};

/**
 * Pick the system prompt for one episode when a memory scope may already be
 * pinned. Same agent + same scope always reuses the pin. A different agent
 * with a different prompt is a conflict: default is keep the pin.
 */
export function resolveEpisodeSystemPrompt(
  options: ResolveEpisodeSystemPromptInput,
): ResolveEpisodeSystemPromptResult {
  const stored = options.storedSystemPrompt?.trim() || null;
  const current = options.currentSystemPrompt.trim();
  if (stored === null) {
    return { systemPrompt: current, conflict: false };
  }
  const storedAgentId = options.storedAgentId?.trim() || null;
  const currentAgentId = options.currentAgentId.trim();
  const differentAgent = storedAgentId !== null && storedAgentId !== currentAgentId;
  const differentPrompt = stored !== current;
  const conflict = differentAgent && differentPrompt;
  if (!conflict) {
    return { systemPrompt: stored, conflict: false };
  }
  const strategy = options.strategy ?? "keep-pinned";
  return {
    systemPrompt: strategy === "use-current" ? current : stored,
    conflict: true,
  };
}

export function formatSystemPromptConflictWarning(options: {
  agentId: string;
  scopeAgentId: string;
  memoryScope: string;
  strategy: SystemPromptConflictStrategy;
}): string {
  const used =
    options.strategy === "use-current"
      ? "Using this agent's system prompt for this episode."
      : "Using the pinned system prompt.";
  return (
    `[adl] Agent "${options.agentId}" ran on memoryScope "${options.memoryScope}" ` +
    `which was started by agent "${options.scopeAgentId}" with a different system prompt. ` +
    `${used} Pass suppressSystemPromptConflictWarning: true to silence this warning.`
  );
}
