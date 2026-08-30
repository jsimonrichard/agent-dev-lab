import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { ADL_PROJECT_WATCH_ENV } from "../project/config";

/** Load a UTF-8 markdown prompt from disk (Node/Bun). Keep prompts colocated with callers. */
export function loadPromptFile(absolutePath: string): string {
  return readFileSync(absolutePath, "utf8");
}

/**
 * Whether file-backed templates should re-read markdown from disk on each `render()`.
 * Enabled only in inspection UI dev (project watcher active). Production serve and
 * one-shot CLI runs cache prompt text at template creation.
 */
export function shouldRereadPromptFileOnRender(): boolean {
  return process.env[ADL_PROJECT_WATCH_ENV] === "1";
}

/** Resolve a path relative to the current module file (`import.meta.url`). */
export function resolvePromptPath(fromImportMetaUrl: string, relative: string): string {
  const dir = dirname(fileURLToPath(fromImportMetaUrl));
  return resolve(dir, relative);
}
