import { realpath } from "node:fs/promises";
import path from "node:path";

import { UNBOUNDED_ALLOW_READ } from "./unbounded-allow-read.ts";

/**
 * Raw `allowRead` before resolution. {@link UNBOUNDED_ALLOW_READ} (`"**"`) is host-wide.
 * `null` / `[]` mean nothing readable. Omitted defaults to `[anchor]`.
 */
export type AllowReadInput = string[] | null | typeof UNBOUNDED_ALLOW_READ | undefined;

/** Anchor field name in a provider `contextSchema` (`cwd` for bash/workspace, `root` for file). */
export type SandboxAnchorField = "cwd" | "root";

/**
 * Schema help for omitted `allowWrite`. Cannot be a Zod `.default()` — the value is
 * `[cwd]` / `[root]`, not a constant.
 */
export function omitAllowWriteSchemaDescription(anchor: SandboxAnchorField): string {
  return `If omitted, defaults to [${anchor}]. Pass [] to allow no writes.`;
}

/**
 * Schema help for omitted `allowRead`. Cannot be a Zod `.default()` — the value is
 * `[cwd]` / `[root]`, not a constant.
 */
export function omitAllowReadSchemaDescription(anchor: SandboxAnchorField): string {
  return (
    `If omitted, defaults to [${anchor}]. Pass [] or null for no reads, or ` +
    `"${UNBOUNDED_ALLOW_READ}" for host-wide reads.`
  );
}

/**
 * Schema help for omitted `cwd` / `root`. Cannot be a Zod `.default()` — the value is
 * the provider constructor argument.
 */
export function omitAnchorSchemaDescription(anchor: SandboxAnchorField): string {
  return `If omitted, uses the ${anchor} the provider was constructed with.`;
}

/**
 * Read a Zod object field's `.description`. Duck-typed so this module stays Zod-free.
 * Throws when the field or description is missing — omit-default help is required, not optional.
 */
export function objectSchemaFieldDescription(schema: unknown, name: string): string {
  if (schema === null || typeof schema !== "object" || !("shape" in schema)) {
    throw new Error("expected an object schema with a shape");
  }
  const shape: unknown = schema.shape;
  if (shape === null || typeof shape !== "object") {
    throw new Error("expected an object schema shape");
  }
  const field: unknown = (shape as Record<string, unknown>)[name];
  if (field === null || typeof field !== "object") {
    throw new Error(`missing schema field ${name}`);
  }
  if (!("description" in field) || typeof field.description !== "string") {
    throw new Error(`schema field ${name} has no description`);
  }
  return field.description;
}

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
