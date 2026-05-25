import type { CoreMessage } from "ai";

import type { Template } from "../template/types";
import type { AgentInstructions } from "./types";

export async function resolveInstructionsText(instructions: AgentInstructions): Promise<string> {
  if (typeof instructions === "string") {
    return instructions;
  }
  const template = instructions as Template<unknown>;
  if (template.demo !== undefined) {
    return template.render(template.demo);
  }
  return template.render({} as never);
}

export async function bootstrapSystemMessage(
  instructions: AgentInstructions,
  existing: CoreMessage[],
): Promise<CoreMessage[]> {
  if (existing.some((m) => m.role === "system")) {
    return existing;
  }
  const content = await resolveInstructionsText(instructions);
  return [{ role: "system", content }];
}
