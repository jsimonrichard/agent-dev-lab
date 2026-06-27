import type { Template } from "../template/types";
import type { AgentInstructions } from "./types";

/**
 * Resolve an agent's instructions to plain text for the AI SDK `system` option.
 *
 * Templates render with their `demo` data when present, otherwise with an empty
 * object. Instructions are supplied to `streamText` via `system` on every episode
 * (not stored as a system message), so this is called once per `agent.run`.
 */
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
