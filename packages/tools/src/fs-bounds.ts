import path from "node:path";

import { AdlError } from "@agent-dev-lab/core";

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
 * Resolve `allowWrite`. `whenOmitted: "anchor"` → `[anchor]`; `"required"` throws if
 * omitted; `"omit"` → `undefined` (file jail: no extra write bound beyond `root`).
 * `[]` is always an empty allow list (no writes) — never treated as omitted.
 */
export function resolveAllowWriteList(options: {
  anchor: string;
  allowWrite: string[] | undefined;
  whenOmitted: "anchor" | "required" | "omit";
}): string[] | undefined {
  const { anchor, allowWrite, whenOmitted } = options;
  if (allowWrite === undefined) {
    if (whenOmitted === "anchor") {
      return [path.resolve(anchor)];
    }
    if (whenOmitted === "omit") {
      return undefined;
    }
    throw new AdlError(
      "INVALID_INPUT",
      "allowWrite is required — pass an explicit list (use [] for no writes).",
    );
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
