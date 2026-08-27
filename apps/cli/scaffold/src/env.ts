import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Minimal `.env` loader so `src/adl.ts` can be imported without going through
 * `loadAdlProject()` (which also loads `.env*` from the project root).
 *
 * Precedence: real environment variables win, then `.env.local`, then `.env`.
 */
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseEnv(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const unprefixed = line.startsWith("export ") ? line.slice("export ".length) : line;
    const eq = unprefixed.indexOf("=");
    if (eq === -1) {
      continue;
    }
    const key = unprefixed.slice(0, eq).trim();
    if (!key) {
      continue;
    }
    let value = unprefixed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

function loadEnvFile(file: string): void {
  const fullPath = path.join(projectRoot, file);
  if (!existsSync(fullPath)) {
    return;
  }
  for (const [key, value] of Object.entries(parseEnv(readFileSync(fullPath, "utf8")))) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

if (process.env.OPENAI_API_KEY === undefined && process.env.openai_api_key !== undefined) {
  process.env.OPENAI_API_KEY = process.env.openai_api_key;
}
