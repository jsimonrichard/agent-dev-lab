import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";

const INTERPOLATION = /\\\$|\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g;

/**
 * Next.js-compatible `.env` file order (highest priority first).
 * Existing `process.env` values are never overwritten.
 *
 * @see https://nextjs.org/docs/pages/guides/environment-variables
 */
export function adlEnvFilesForMode(mode: string): string[] {
  return [
    `.env.${mode}.local`,
    mode === "test" ? undefined : ".env.local",
    `.env.${mode}`,
    ".env",
  ].filter((filename): filename is string => filename !== undefined);
}

/**
 * Resolves the env file mode. Unknown / unset `NODE_ENV` is treated as development
 * so `adl workflow run` and `adl dashboard` still pick up `.env.development` / `.env.local`.
 */
export function resolveAdlEnvMode(explicit?: string): string {
  if (explicit) {
    return explicit;
  }
  const nodeEnv = process.env.NODE_ENV;
  if (nodeEnv === "production" || nodeEnv === "test" || nodeEnv === "development") {
    return nodeEnv;
  }
  return "development";
}

function expandEnvValue(value: string, env: NodeJS.ProcessEnv): string {
  return value.replace(
    INTERPOLATION,
    (match, braced: string | undefined, bare: string | undefined) => {
      if (match === "\\$") {
        return "$";
      }
      const key = braced ?? bare;
      if (!key) {
        return match;
      }
      return env[key] ?? "";
    },
  );
}

function readEnvFile(filePath: string): string | undefined {
  try {
    const stats = statSync(filePath);
    if (!stats.isFile()) {
      return undefined;
    }
    return readFileSync(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

/**
 * Loads `.env*` files from an ADL project root into `process.env`.
 *
 * Same precedence as Next.js / Vite: `.env.[mode].local`, `.env.local` (skipped in
 * `test`), `.env.[mode]`, then `.env`. Values already present in `process.env` win.
 * Call this before evaluating project config so `src/adl.ts` sees provider keys.
 */
export function loadAdlProjectEnv(
  projectRoot: string,
  options?: { mode?: string },
): { loadedFiles: string[] } {
  const mode = resolveAdlEnvMode(options?.mode);
  const loadedFiles: string[] = [];
  const root = path.resolve(projectRoot);

  for (const filename of adlEnvFilesForMode(mode)) {
    const contents = readEnvFile(path.join(root, filename));
    if (contents === undefined) {
      continue;
    }
    loadedFiles.push(filename);
    const parsed = parseEnv(contents);
    for (const [key, raw] of Object.entries(parsed)) {
      if (process.env[key] !== undefined) {
        continue;
      }
      process.env[key] = expandEnvValue(raw ?? "", process.env);
    }
  }

  normalizeOpenAiApiKeyAlias();
  return { loadedFiles };
}

/** Accept lowercase `openai_api_key` as an alias for `OPENAI_API_KEY`. */
function normalizeOpenAiApiKeyAlias(): void {
  if (process.env.OPENAI_API_KEY === undefined && process.env.openai_api_key !== undefined) {
    process.env.OPENAI_API_KEY = process.env.openai_api_key;
  }
}

export type LoadAdlEnvOptions = {
  /** Project root containing `.env*`. Defaults to `process.cwd()`. */
  root?: string;
  mode?: string;
};

/**
 * Load ADL `.env*` files into `process.env`. Prefer calling this once at the top of
 * `src/model.ts` / `src/adl.ts` when those modules read `process.env` at import time.
 * {@link createAdlRuntime} also loads env by default.
 */
export function loadAdlEnv(options: LoadAdlEnvOptions = {}): { loadedFiles: string[] } {
  return loadAdlProjectEnv(options.root ?? process.cwd(), { mode: options.mode });
}
