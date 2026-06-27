import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "@agent-dev-lab/core";

/**
 * Shared model for every agent in this project.
 *
 * The OpenAI provider reads `OPENAI_API_KEY` lazily (at request time), so building
 * `model` at module load is safe even before a key is present — agents only fail
 * when actually run without a key. Override the model id with `ADL_OPENAI_MODEL`.
 */
const openai = createOpenAI();

export const DEFAULT_MODEL_ID = process.env.ADL_OPENAI_MODEL ?? "gpt-5.4-mini";

export const model: LanguageModel = openai(DEFAULT_MODEL_ID);

/** Whether an OpenAI key is configured — used by the CLI demo to give a friendly hint. */
export function hasOpenAiKey(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}
