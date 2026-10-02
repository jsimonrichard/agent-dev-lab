import type { LanguageModel } from "ai";

import { AdlError } from "../errors";
import type { AdlModelCatalogEntry } from "./config";

/** Minimal project surface needed to resolve a catalog id (hosts may duck-type this). */
export type ModelCatalogLookup = {
  getModel(id: string): AdlModelCatalogEntry | undefined;
  listModelIds(): string[];
};

/**
 * Resolve a catalog id to a live {@link LanguageModel} via the entry's factory.
 *
 * Fail closed: unknown id or a factory that does not return a model throws.
 * Never falls back to `defaults.model` / definition model — callers that omit
 * a catalog id should simply leave `AgentRunInput.model` unset.
 *
 * Does not consult agent resolution; hosts use this before `agent.run({ model })`.
 */
export function resolveCatalogModel(project: ModelCatalogLookup, catalogId: string): LanguageModel {
  const entry = project.getModel(catalogId);
  if (!entry) {
    throw new AdlError(
      "UNKNOWN_MODEL",
      `Unknown model catalog id "${catalogId}". Known ids: ${formatKnownModelIds(project)}`,
    );
  }
  const model = entry.factory();
  if (model == null) {
    throw new AdlError(
      "INVALID_CONFIG",
      `Model catalog entry "${catalogId}" factory returned no LanguageModel`,
    );
  }
  return model;
}

/**
 * When the entry declares {@link AdlModelCatalogEntry.apiKeyEnv}, require that
 * env var to be set (non-empty after trim). No-op when `apiKeyEnv` is omitted.
 */
export function assertCatalogModelApiKey(
  entry: AdlModelCatalogEntry,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const name = entry.apiKeyEnv;
  if (name === undefined) {
    return;
  }
  if (typeof name !== "string" || name.trim().length === 0) {
    throw new AdlError(
      "INVALID_CONFIG",
      `Model catalog entry "${entry.id}" has an empty apiKeyEnv`,
    );
  }
  const value = env[name];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new AdlError(
      "MISSING_API_KEY",
      `Model catalog entry "${entry.id}" requires ${name} to be set before running`,
    );
  }
}

function formatKnownModelIds(project: ModelCatalogLookup): string {
  const ids = project.listModelIds();
  return ids.length > 0 ? ids.join(", ") : "(none)";
}
