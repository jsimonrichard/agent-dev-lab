/** Client-safe inspector project metadata (no Node / core runtime imports). */
export interface ProjectInspectorMeta {
  name: string;
  root: string;
  configPath: string;
  devMode: "framework-dev" | "project-dev" | "serve";
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
}
