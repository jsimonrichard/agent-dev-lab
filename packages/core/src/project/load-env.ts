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
 * so `adl run` and `adl dev` still pick up `.env.development` / `.env.local`.
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

  return { loadedFiles };
}
