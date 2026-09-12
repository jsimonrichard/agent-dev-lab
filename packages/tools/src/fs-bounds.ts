import path from "node:path";

import { UNBOUNDED_ALLOW_READ } from "./unbounded-allow-read.ts";

/**
 * Raw `allowRead` before resolution. {@link UNBOUNDED_ALLOW_READ} (`"**"`) is host-wide.
 * `null` / `[]` mean nothing readable. Omitted defaults to `[anchor]`.
 */
export type AllowReadInput = string[] | null | typeof UNBOUNDED_ALLOW_READ | undefined;

/** Resolved read bound: a root list (`[]` = deny all) or {@link UNBOUNDED_ALLOW_READ}. */
export type ResolvedAllowRead = string[] | typeof UNBOUNDED_ALLOW_READ;

function uniqueResolved(paths: readonly string[]): string[] {
  return [...new Set(paths.map((p) => path.resolve(p)))];
}

/**
 * Resolve `allowWrite`. Omitted → `[anchor]`. `[]` is an empty allow list (no writes) —
 * never treated as omitted. The file jail's optional extra write bound (omitted vs `[]`)
 * stays local to the jail; it does not go through this helper.
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
 * Resolve `allowRead` against an anchor (bash cwd / file jail root).
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
