import type { CoreMessage } from "ai";

import type { Template } from "../template/types.js";
import type { AgentInstructions } from "./types.js";

export function resolveInstructionsText(instructions: AgentInstructions): string {
  if (typeof instructions === "string") {
    return instructions;
  }
  const template = instructions as Template<unknown>;
  if (template.demo !== undefined) {
    return template.render(template.demo);
  }
  return template.render({} as never);
}

/**
 * Render instructions as a system message only when the store is empty (first run
 * for this memoryScope). Existing messages are returned as-is even if they lack a
 * system message — prepending one retroactively would be inconsistent with the
 * AI-generated responses that follow.
 */
export function bootstrapSystemMessage(
  instructions: AgentInstructions,
  existing: CoreMessage[],
): CoreMessage[] {
  if (existing.length > 0) {
    return existing;
  }
  const content = resolveInstructionsText(instructions);
  return [{ role: "system", content }];
}
