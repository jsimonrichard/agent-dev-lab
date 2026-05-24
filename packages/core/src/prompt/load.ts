import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Load a UTF-8 markdown prompt from disk (Node/Bun). Keep prompts colocated with callers. */
export function loadPromptFile(absolutePath: string): string {
  return readFileSync(absolutePath, "utf8");
}

/** Resolve a path relative to the current module file (`import.meta.url`). */
export function resolvePromptPath(fromImportMetaUrl: string, relative: string): string {
  const dir = dirname(fileURLToPath(fromImportMetaUrl));
  return resolve(dir, relative);
}
