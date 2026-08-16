export interface AgentToolSummary {
  name: string;
  description: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function toolDescription(tool: unknown): string {
  if (!isRecord(tool) || typeof tool.description !== "string") {
    return "";
  }
  return tool.description;
}

function toolSetEntries(value: unknown): AgentToolSummary[] {
  if (!isRecord(value)) {
    return [];
  }
  return Object.entries(value).map(([name, tool]) => ({
    name,
    description: toolDescription(tool),
  }));
}

/** Runtime tools plus agent-defined tools (agent keys win), matching `streamText` merge. */
export function inspectAgentTools(agent: unknown): AgentToolSummary[] {
  if (!isRecord(agent)) {
    return [];
  }
  const definition = isRecord(agent.definition) ? agent.definition : undefined;
  const services = isRecord(agent.services) ? agent.services : undefined;
  const byName = new Map<string, AgentToolSummary>();
  for (const tool of [...toolSetEntries(services?.tools), ...toolSetEntries(definition?.tools)]) {
    byName.set(tool.name, tool);
  }
  return [...byName.values()];
}
