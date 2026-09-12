import path from "node:path";

import { AdlError } from "@agent-dev-lab/core";

import { UNBOUNDED_ALLOW_READ } from "./unbounded-allow-read.ts";

/**
 * Raw `allowRead` before resolution. `"unbounded"` / {@link UNBOUNDED_ALLOW_READ} and
 * bash `null` mean host-wide once `nullMeans` is `"unbounded"`.
 */
export type AllowReadInput = string[] | null | typeof UNBOUNDED_ALLOW_READ | undefined;

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
 * - `[]` → deny all reads
 * - `UNBOUNDED_ALLOW_READ` → unbounded (`null`)
 * - `null` → unbounded when `nullMeans: "unbounded"` (bash); deny-all when
 *   `nullMeans: "deny-all"` (file jail)
 * - Explicit list → that list only (not unioned with `allowWrite`)
 *
 * Escape-hatch bash executors have no anchor at construct time and do **not** call this
 * for omitted reads — they keep omitted → `allowWrite`. Providers call this via
 * `mergePolicy` so pooled executors receive a concrete list.
 */
export function resolveAllowReadList(options: {
  anchor: string;
  allowRead: AllowReadInput;
  nullMeans: "unbounded" | "deny-all";
}): string[] | null {
  const { anchor, allowRead, nullMeans } = options;
  if (allowRead === UNBOUNDED_ALLOW_READ) {
    return null;
  }
  if (allowRead === null) {
    return nullMeans === "unbounded" ? null : [];
  }
  if (allowRead === undefined) {
    return [path.resolve(anchor)];
  }
  return uniqueResolved(allowRead);
}
