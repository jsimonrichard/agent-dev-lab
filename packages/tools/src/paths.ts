import path from "node:path";

/** Mirrors `@agent-dev-lab/core`'s `DEFAULT_SQLITE_RELATIVE_PATH` convention — same `.data/` dir. */
export const DEFAULT_SANDBOX_RELATIVE_PATH = ".data/sandbox";

/**
 * Resolves a default sandbox root for the file/bash/workspace tools: absolute `ADL_SANDBOX_ROOT`
 * as-is, otherwise `DEFAULT_SANDBOX_RELATIVE_PATH` relative to `projectRoot` (or `process.cwd()`
 * if omitted). Mirrors `@agent-dev-lab/core`'s `resolveAdlSqlitePath` exactly: pure path
 * resolution, no filesystem side effects — creating the directory is the caller's job (via
 * `mkdirSync`), same split as that function's own `mkdirSync` happening at DB-open time, not in
 * the resolver.
 */
export function resolveDefaultSandboxRoot(projectRoot?: string): string {
  const raw = process.env.ADL_SANDBOX_ROOT ?? DEFAULT_SANDBOX_RELATIVE_PATH;
  if (path.isAbsolute(raw)) {
    return raw;
  }
  return path.resolve(projectRoot ?? process.cwd(), raw);
}
