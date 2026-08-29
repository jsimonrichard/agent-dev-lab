import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadAdlEnv } from "@agent-dev-lab/core";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "@agent-dev-lab/core";

loadAdlEnv({ root: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..") });

/**
 * Shared model for every agent in this project.
 *
 * The OpenAI provider reads `OPENAI_API_KEY` lazily (at request time), so building
 * `model` at module load is safe even before a key is present — agents only fail
 * when actually run without a key. Override the model id with `ADL_MODEL`.
 */
const openai = createOpenAI();

export const DEFAULT_MODEL_ID = process.env.ADL_MODEL ?? "gpt-4o-mini";

export const model: LanguageModel = openai(DEFAULT_MODEL_ID);
