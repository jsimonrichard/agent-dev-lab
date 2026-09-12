import { realpath } from "node:fs/promises";
import path from "node:path";

import { UNBOUNDED_ALLOW_READ } from "./unbounded-allow-read.ts";

/**
 * Raw `allowRead` before resolution. {@link UNBOUNDED_ALLOW_READ} (`"**"`) is host-wide.
 * `null` / `[]` mean nothing readable. Omitted defaults to `[anchor]`.
 */
export type AllowReadInput = string[] | null | typeof UNBOUNDED_ALLOW_READ | undefined;

/** Resolved read bound: a root list (`[]` = deny all) or {@link UNBOUNDED_ALLOW_READ}. */
export type ResolvedAllowRead = string[] | typeof UNBOUNDED_ALLOW_READ;

/** Allow list for a {@link PathBound}. Write side never uses {@link UNBOUNDED_ALLOW_READ}. */
export type PathAllow = ResolvedAllowRead;

/**
 * Resolved allow/deny settings for one access mode (read or write). Built after omit/`null`
 * resolution — `allow` is never “skipped.”
 */
export type PathBound = {
  allow: PathAllow;
  deny: readonly string[];
};

/** Why {@link checkPathAccess} refused a path. `undefined` from the check means allowed. */
export type PathAccessDenial = { kind: "denied"; denyRoot: string } | { kind: "outside-allow" };

function uniqueResolved(paths: readonly string[]): string[] {
  return [...new Set(paths.map((p) => path.resolve(p)))];
}

/**
 * Resolve `allowWrite`. Omitted → `[anchor]`. `[]` is an empty allow list (no writes) —
 * never treated as omitted.
 */
export function resolveAllowWriteList(options: {
  anchor: string;
  allowWrite: string[] | undefined;
}): string[] {
  const { anchor, allowWrite } = options;
  if (allowWrite === undefined) {
    return [path.resolve(anchor)];
  }
  return uniqueResolved(allowWrite);
}

/**
 * Resolve `allowRead` against an anchor (bash cwd / file jail cwd).
 *
 * - Omitted → `[anchor]`
 * - `null` / `[]` → `[]` (deny all)
 * - {@link UNBOUNDED_ALLOW_READ} → host-wide
 * - Explicit list → that list only (not unioned with `allowWrite`)
 *
 * Escape-hatch bash executors have no anchor at construct time and do **not** call this
 * for omitted reads — they keep omitted → `allowWrite`. Providers call this via
 * `mergePolicy` so pooled executors receive a concrete list.
 */
export function resolveAllowReadList(options: {
  anchor: string;
  allowRead: AllowReadInput;
}): ResolvedAllowRead {
  const { anchor, allowRead } = options;
  if (allowRead === UNBOUNDED_ALLOW_READ) {
    return UNBOUNDED_ALLOW_READ;
  }
  if (allowRead === undefined) {
    return [path.resolve(anchor)];
  }
  if (allowRead === null) {
    return [];
  }
  return uniqueResolved(allowRead);
}

/** Resolve a deny list. Omitted / `null` → `[]`. */
export function resolveDenyList(paths: readonly string[] | null | undefined): string[] {
  if (paths == null) {
    return [];
  }
  return uniqueResolved(paths);
}

/**
 * True when `candidate` is `root` or a path under it (symlink-blind string check via
 * `path.relative`).
 */
export function isWithinRoot(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function isWithinAny(candidate: string, roots: readonly string[]): boolean {
  return roots.some((root) => isWithinRoot(candidate, root));
}

/**
 * Whether `candidate` is permitted by `bound`. Deny is checked before allow.
 * Returns `undefined` when allowed.
 */
export function checkPathAccess(candidate: string, bound: PathBound): PathAccessDenial | undefined {
  for (const denyRoot of bound.deny) {
    if (isWithinRoot(candidate, denyRoot)) {
      return { kind: "denied", denyRoot };
    }
  }
  if (bound.allow === UNBOUNDED_ALLOW_READ) {
    return undefined;
  }
  if (isWithinAny(candidate, bound.allow)) {
    return undefined;
  }
  return { kind: "outside-allow" };
}

/**
 * `realpath`; on ENOENT return `path.resolve(p)`; rethrow other errors.
 * Used when preparing allow/deny roots that may not exist yet.
 */
export async function realpathOrResolve(p: string): Promise<string> {
  try {
    return await realpath(p);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return path.resolve(p);
    }
    throw error;
  }
}

/** Realpath every path in a bound ({@link UNBOUNDED_ALLOW_READ} left as-is). */
export async function realpathPathBound(bound: PathBound): Promise<PathBound> {
  const deny = await Promise.all(bound.deny.map(realpathOrResolve));
  if (bound.allow === UNBOUNDED_ALLOW_READ) {
    return { allow: UNBOUNDED_ALLOW_READ, deny };
  }
  const allow = await Promise.all(bound.allow.map(realpathOrResolve));
  return { allow, deny };
}
