import type { LanguageModel } from "ai";

/** Reported as {@link AgentModelInfo.modelId} when a model object hides its id. */
export const CUSTOM_MODEL_ID = "custom";

/** Inspector-facing description of an agent's effective model. */
export type AgentModelInfo = {
  /** Provider model id (e.g. `"gpt-4o-mini"`), or `"custom"` when the model object omits it. */
  modelId: string;
  /** Provider id (e.g. `"openai.chat"`) when the model exposes one. */
  provider?: string;
};

/**
 * Resolves inspector model info from a {@link LanguageModel} (`string` id or
 * provider model object). Returns `null` when no model is set or the model
 * reveals nothing about itself — inspectors should omit the field entirely.
 */
export function inspectLanguageModel(model: LanguageModel | undefined): AgentModelInfo | null {
  if (!model) {
    return null;
  }
  if (typeof model === "string") {
    const modelId = model.trim();
    return modelId ? { modelId } : null;
  }
  const modelId = model.modelId?.trim();
  const provider = model.provider?.trim();
  if (modelId) {
    return provider ? { modelId, provider } : { modelId };
  }
  return provider ? { modelId: CUSTOM_MODEL_ID, provider } : null;
}
