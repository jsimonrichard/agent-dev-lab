import type { Result } from "@agent-dev-lab/core/result";

import type { JsonValue } from "#/lib/view-model/types";

/** Client-safe inspector project metadata (no Node / core runtime imports). */
export interface ProjectInspectorMeta {
  name: string;
  root: string;
  configPath: string;
  devMode: "framework-dev" | "project-dev" | "serve";
  /** Monotonic hot-reload generation from {@link LoadedAdlProject.generation}. */
  generation: number;
  /** Last hot-reload failure message, if any. */
  lastReloadError: string | null;
  workflowIds: string[];
  workflows: WorkflowInspectorMeta[];
  agentIds: string[];
  agents: AgentInspectorMeta[];
}

export type WorkflowInputFieldKind = "string" | "number" | "boolean" | "json";

export interface WorkflowInputField {
  name: string;
  kind: WorkflowInputFieldKind;
  required: boolean;
  description?: string;
  options?: string[];
}

export interface WorkflowInspectorMeta {
  id: string;
  inputFields: WorkflowInputField[];
  /** `{}` parsed through the live workflow input schema (defaults applied by Zod). */
  inputSample?: JsonValue;
}

/** Effective model for an agent (mirrors core's `AgentModelInfo`, kept client-safe). */
export interface AgentModelInspectorMeta {
  /** Provider model id (e.g. `"gpt-4o-mini"`), or `"custom"` when the model object omits it. */
  modelId: string;
  /** Provider id (e.g. `"openai.chat"`) when the model exposes one. */
  provider?: string;
}

export interface AgentInspectorMeta {
  id: string;
  tools: { name: string; description: string }[];
  /** Message-store backend (`"in-memory"`, `"sqlite"`, or a custom kind). */
  memoryMode: string;
  /** `null` when no model is configured or it reveals nothing — hide it in the UI. */
  model: AgentModelInspectorMeta | null;
  /** Id of the optional conversation-title workflow, when configured. */
  titleWorkflowId: string | null;
  /** Resolved `stopWhen` label (`default` is `stepCountIs(20)`). */
  stopWhen: "default" | "custom";
  /** Compact description of structured output, when the agent has an `outputSchema`. */
  outputSchema: string | null;
  /** Live system prompt inspect result shown at the top of conversation views. */
  systemPrompt: Result<string, string>;
  /** Relative file path when the prompt is a file-backed template. */
  systemPromptPath: string | null;
}
