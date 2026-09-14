import type {
  AgentToolProviderContextMeta,
  WorkflowInputField,
} from "#/lib/inspector/inspector-types";
import type { JsonValue } from "#/lib/view-model/types";
import {
  buildWorkflowInput,
  describeWorkflowInput,
  sampleWorkflowInput,
  workflowInputValuesFromSample,
} from "#/lib/workflow/workflow-input-schema";

export interface AgentToolSummary {
  name: string;
  description: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function toolDescription(tool: unknown): string {
  if (!isRecord(tool)) {
    return "";
  }
  if (typeof tool.description === "string" && tool.description.length > 0) {
    return tool.description;
  }
  // Provider-defined tools (e.g. openai.tools.webSearch) expose `id`, not `description`.
  if (typeof tool.id === "string") {
    return tool.id;
  }
  return "";
}

/**
 * A `definition.tools` (or `services.tools`) value that's a `ToolProvider` rather than a plain
 * `ToolSet` — duck-typed the same way the runtime distinguishes them (`resolveToolSource`),
 * since this file stays core-import-free to keep it client-safe.
 */
function isToolProvider(value: Record<string, unknown>): boolean {
  return typeof value.getTools === "function";
}

/**
 * A `ToolProvider`'s tools genuinely depend on a per-call context (`agentId`, `memoryScope`,
 * `toolProviderContext`) this settings-panel read has no real value for — so, unlike a plain
 * `ToolSet`, its own keys (`getTools`, `contextSchema`, ...) must never be listed as if they
 * were tool names. `listTools` is the provider's own optional, context-free introspection hook
 * (see `ToolProvider.listTools`'s doc comment in `@agent-dev-lab/core`); fall back to an empty
 * list — not a fabricated context — when a provider doesn't declare one.
 */
function providerToolSummaries(provider: Record<string, unknown>): AgentToolSummary[] {
  const listTools = provider.listTools;
  if (typeof listTools !== "function") {
    return [];
  }
  const result: unknown = listTools.call(provider);
  if (!Array.isArray(result)) {
    return [];
  }
  return result.filter(isRecord).flatMap((entry) =>
    typeof entry.name === "string"
      ? [
          {
            name: entry.name,
            description: typeof entry.description === "string" ? entry.description : "",
          },
        ]
      : [],
  );
}

function toolSetEntries(value: unknown): AgentToolSummary[] {
  if (!isRecord(value)) {
    return [];
  }
  if (isToolProvider(value)) {
    return providerToolSummaries(value);
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

/**
 * Resolved `stopWhen` label for the settings panel — "default" vs. "custom".
 *
 * Deliberately reads `agent.definition.stopWhen` (the raw, possibly-`undefined` field) rather
 * than the defaulted `agent.stopWhen` getter compared by reference against `@agent-dev-lab/core`'s
 * `DEFAULT_AGENT_STOP_WHEN`: the project's agents are constructed inside a separately-loaded
 * module realm (the project is transpiled and run through `jiti` with `tryNative: false`, so it
 * never shares this app's own native import of `@agent-dev-lab/core`), so that constant would
 * never `===` the one this app imports — every agent that never sets a custom `stopWhen` would
 * be mislabeled "custom". Checking for `undefined` sidesteps cross-realm identity entirely.
 */
export function inspectAgentStopWhen(agent: unknown): "default" | "custom" {
  if (!isRecord(agent)) {
    return "default";
  }
  const definition = isRecord(agent.definition) ? agent.definition : undefined;
  return definition?.stopWhen === undefined ? "default" : "custom";
}

/** Compact, client-safe description of an agent's Zod `outputSchema`. */
export function inspectAgentOutputSchema(agent: unknown): string | null {
  if (!isRecord(agent)) {
    return null;
  }
  const definition = isRecord(agent.definition) ? agent.definition : undefined;
  const schema = definition?.outputSchema;
  if (!schema || typeof schema !== "object") {
    return null;
  }
  const fields = describeWorkflowInput(schema);
  if (fields.length === 0) {
    return "structured";
  }
  return `{ ${fields.map((field) => `${field.name}: ${field.kind}`).join(", ")} }`;
}

function agentToolSources(agent: unknown): unknown[] {
  if (!isRecord(agent)) {
    return [];
  }
  const definition = isRecord(agent.definition) ? agent.definition : undefined;
  const services = isRecord(agent.services) ? agent.services : undefined;
  return [definition?.tools, services?.tools];
}

/**
 * Whether this agent needs a `toolProviderContext` form, plus `contextSchema` fields
 * when that schema describes an object. Definition tools win over runtime tools for the
 * schema (same precedence as tool-name merge). The host still never parses the value —
 * this is only for building a form.
 */
export function inspectAgentToolProviderContext(agent: unknown): AgentToolProviderContextMeta {
  const providers = agentToolSources(agent).filter(
    (value): value is Record<string, unknown> => isRecord(value) && isToolProvider(value),
  );
  if (providers.length === 0) {
    return { declared: false, fields: [] };
  }
  const withSchema = providers.find((provider) => provider.contextSchema !== undefined);
  const schema = withSchema?.contextSchema;
  return {
    declared: true,
    fields: describeWorkflowInput(schema),
    sample: sampleWorkflowInput(schema),
  };
}

/**
 * Build the raw `toolProviderContext` to send with a standalone agent turn.
 * Object-schema fields go through {@link buildWorkflowInput}; a provider with no
 * object schema uses the JSON textarea. Empty JSON / a non-provider agent omit
 * the value (`undefined`), matching CLI when `--tool-context` is absent.
 */
export function buildToolProviderContextInput(options: {
  declared: boolean;
  fields: WorkflowInputField[];
  values: Record<string, string | boolean>;
  rawJson: string;
}): unknown | undefined {
  if (!options.declared) {
    return undefined;
  }
  if (options.fields.length > 0) {
    return buildWorkflowInput(options.fields, options.values);
  }
  const text = options.rawJson.trim();
  if (text.length === 0) {
    return undefined;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new Error(
      `toolProviderContext must be valid JSON${error instanceof Error ? `: ${error.message}` : ""}`,
    );
  }
}

/** Seed the conversation / definition form from a stored JSON value or schema sample. */
export function seedToolProviderContextForm(options: {
  fields: WorkflowInputField[];
  sample?: JsonValue;
  seed?: JsonValue;
}): { values: Record<string, string | boolean>; rawJson: string } {
  const seed = options.seed ?? options.sample;
  if (options.fields.length > 0) {
    return {
      values: workflowInputValuesFromSample(options.fields, seed),
      rawJson: "",
    };
  }
  if (seed !== undefined) {
    return { values: {}, rawJson: JSON.stringify(seed, null, 2) };
  }
  return { values: {}, rawJson: "" };
}
