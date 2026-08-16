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

export interface AgentInspectorMeta {
  id: string;
  tools: { name: string; description: string }[];
}
