import type { EffectDecision, EffectHandler, EffectIntent } from "@agent-dev-lab/core";

import type { ToolEffectPayload } from "./types.ts";

function toolNameFromIntent(intent: EffectIntent): string | undefined {
  if (intent.kind !== "tool") {
    return undefined;
  }
  const payload = intent.payload;
  if (
    typeof payload === "object" &&
    payload !== null &&
    "toolName" in payload &&
    typeof (payload as ToolEffectPayload).toolName === "string"
  ) {
    return (payload as ToolEffectPayload).toolName;
  }
  return undefined;
}

/**
 * Dispatcher-policy sticky allow: once a tool name is allowed, later intents with
 * the same `toolName` short-circuit to allow without asking `inner` again.
 * Substrate stays per-call — this is handler state, not a framework decision type.
 */
export function createStickyToolAllowHandler(inner: EffectHandler): EffectHandler {
  const allowedToolNames = new Set<string>();
  return {
    async onIntent(intent: EffectIntent): Promise<EffectDecision | undefined> {
      const toolName = toolNameFromIntent(intent);
      if (toolName !== undefined && allowedToolNames.has(toolName)) {
        return { action: "allow" };
      }
      const decision = await inner.onIntent(intent);
      if (decision?.action === "allow" && toolName !== undefined) {
        allowedToolNames.add(toolName);
      }
      return decision;
    },
  };
}
