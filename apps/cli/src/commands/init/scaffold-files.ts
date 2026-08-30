import { readdirSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Scaffold files that are rewritten at init time (not copied as-is).
 * `.env` is never copied — only `.env.example` ships.
 */
export const SCAFFOLD_REWRITTEN_FILES = ["package.json", ".gitignore"] as const;

/** Extra scaffold files packaged with the CLI (versions + gitignore), not copied as-is. */
export const SCAFFOLD_PACKAGED_FILES = SCAFFOLD_REWRITTEN_FILES;

const SKIP_NAMES = new Set<string>([
  ...SCAFFOLD_REWRITTEN_FILES,
  ".env",
  "node_modules",
  "bunfig.toml",
]);

/**
 * Relative paths of scaffold files that `adl init` copies (with optional
 * `{{PLACEHOLDER}}` substitution). Derived from the files on disk so adding a
 * workflow or agent does not require updating a hardcoded list.
 */
export function listScaffoldSourceFiles(scaffoldRoot: string): string[] {
  const files: string[] = [];

  const walk = (dir: string, prefix: string): void => {
    for (const name of readdirSync(dir).sort()) {
      if (SKIP_NAMES.has(name)) {
        continue;
      }
      const fullPath = path.join(dir, name);
      const relative = prefix ? `${prefix}/${name}` : name;
      if (statSync(fullPath).isDirectory()) {
        walk(fullPath, relative);
      } else {
        files.push(relative);
      }
    }
  };

  walk(scaffoldRoot, "");
  return files;
}
