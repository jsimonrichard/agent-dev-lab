import type { CoreMessage } from "ai";

import type { Template } from "../template/types";
import type { AgentInstructions } from "./types";

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

export function bootstrapSystemMessage(
  instructions: AgentInstructions,
  existing: CoreMessage[],
): CoreMessage[] {
  if (existing.some((m) => m.role === "system")) {
    return existing;
  }
  const content = resolveInstructionsText(instructions);
  return [{ role: "system", content }, ...existing];
}
