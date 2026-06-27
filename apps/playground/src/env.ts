import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Minimal `.env` loader for the playground.
 *
 * Bun's CLI auto-loads `.env` for `bun run start`, but the inspection UI and CLI load
 * this project's config from another process, so we load it explicitly here. Imported
 * for its side effect from `src/adl.ts` and `src/model.ts` so it runs before any agent
 * reads `OPENAI_API_KEY` / `ADL_OPENAI_MODEL`.
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
    // Only set when unset so real env vars (and earlier-loaded files) take precedence.
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

// `.env.local` first so it overrides `.env`; both yield to the real environment.
loadEnvFile(".env.local");
loadEnvFile(".env");
