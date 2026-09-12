import { matchesUrlPattern } from "../web/url-pattern.ts";

/**
 * Which host environment variables enter the sandbox. Omitted / `[]` → none.
 * `true` → every string-valued host var. A list keeps a host var when any entry matches
 * the **name** (literal, glob `*`/`**`, or a `RegExp` spanning the whole name) — same
 * full-string rule as {@link matchesUrlPattern}.
 */
export type AllowEnv = true | ReadonlyArray<string | RegExp>;

/** Resolve {@link AllowEnv} against the current host `process.env` (string values only). */
export function resolveAllowEnv(allowEnv: AllowEnv | undefined): Record<string, string> {
  if (allowEnv === true) {
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (typeof value === "string") {
        env[key] = value;
      }
    }
    return env;
  }
  if (allowEnv === undefined || allowEnv.length === 0) {
    return {};
  }
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value !== "string") {
      continue;
    }
    if (allowEnv.some((pattern) => matchesUrlPattern(pattern, key))) {
      env[key] = value;
    }
  }
  return env;
}

/**
 * Canonical form for pool keys: `true`, or a sorted list of literal/glob strings and
 * `RegExp` `source`+`flags` (so identity is stable across construction order).
 */
export type CanonicalAllowEnv =
  | true
  | ReadonlyArray<
      { kind: "string"; value: string } | { kind: "regexp"; source: string; flags: string }
    >;

export function canonicalizeAllowEnv(allowEnv: AllowEnv | undefined): CanonicalAllowEnv {
  if (allowEnv === true) {
    return true;
  }
  if (allowEnv === undefined || allowEnv.length === 0) {
    return [];
  }
  const entries: Array<
    { kind: "string"; value: string } | { kind: "regexp"; source: string; flags: string }
  > = allowEnv.map((entry) =>
    typeof entry === "string"
      ? { kind: "string", value: entry }
      : { kind: "regexp", source: entry.source, flags: entry.flags },
  );
  return entries.sort((a, b) => {
    const left = a.kind === "string" ? `s:${a.value}` : `r:${a.source}\0${a.flags}`;
    const right = b.kind === "string" ? `s:${b.value}` : `r:${b.source}\0${b.flags}`;
    return left < right ? -1 : left > right ? 1 : 0;
  });
}
