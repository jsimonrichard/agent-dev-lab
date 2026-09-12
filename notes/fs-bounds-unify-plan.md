# Plan: unify allowRead / allowWrite resolution

**Status:** approved (revised 2026-09-12) — implement.  
**Date:** 2026-09-12

## Goal

One shared resolution path so omitted `allowRead` is **`[anchor]`** (cwd for bash
providers, root for the file jail) everywhere that default is applied — not a silent
copy of `allowWrite`. Providers are the place that know cwd; escape-hatch executors do
not invent one.

## Decisions (review answers)

1. **Do not** auto-union `allowWrite` into `allowRead` for now. Lists stay independent.
2. **Do not** add `cwd` to executor construct options. Omitted → `[cwd]` only at
   provider `mergePolicy` (and file jail → `[root]`). Escape-hatch executors / pool
   canonicalize may still default omitted read to `allowWrite` when no provider filled
   the field — documented, not a second cwd.
3. **`allowRead: []` stays deny-all** (no re-adding write roots).

## Principles

1. **Omitted read → anchor only.** `unique([anchor])`, not `allowWrite`, not
   `[anchor, ...allowWrite]`.
2. **One resolver, thin call sites.** Shared helpers; call sites supply `anchor` and
   how `null` is read.
3. **Keep real asymmetries.** File `null` = deny-all; bash `null` / `UNBOUNDED` =
   unbounded. File `allowWrite` omitted = no extra write bound; bash provider omitted
   write = `[cwd]`; executors require `allowWrite`.
4. **One concern per change.**

## Desired resolved contract

| Input `allowRead` | Result (after resolve) |
|---|---|
| omitted (`undefined`) | `[path.resolve(anchor)]` |
| explicit list | that list (resolved/deduped); **not** unioned with `allowWrite` |
| `[]` | `[]` — deny all reads |
| `UNBOUNDED_ALLOW_READ` | unbounded |
| `null` | bash: unbounded; file: deny-all (`nullMeans`) |

## Module

`packages/tools/src/fs-bounds.ts`:

```ts
export function resolveAllowWriteList(options: {
  anchor: string;
  allowWrite: string[] | undefined;
  whenOmitted: "anchor" | "required" | "omit";
}): string[] | undefined;

export function resolveAllowReadList(options: {
  anchor: string;
  allowRead: AllowReadInput;
  /** Bash: `null` → unbounded. File: `null` → deny-all. */
  nullMeans: "unbounded" | "deny-all";
}): string[] | null; // null = unbounded
```

### Call-site map

1. `mergePolicy` — both helpers; `nullMeans: "unbounded"`; omitted read → `[cwd]`
2. `createFileJail` / `resolveFileAllowRead` — read helper; `nullMeans: "deny-all"`;
   map returned `null` → jail-internal unbounded (`undefined`)
3. native / ASRT / pool — **no** `resolveAllowReadList` without anchor; keep
   omitted → `allowWrite` for escape-hatch / incomplete policy; comment that providers
   always pass a concrete `allowRead` after merge

## Work sections

1. Add `fs-bounds.ts` + unit tests
2. Wire `mergePolicy` + file jail; update docs/README/changeset as needed
3. Comment pool/native/ASRT omitted-read → `allowWrite` as escape-hatch-only

## Out of scope

- Write ⊆ read union (deferred)
- Optional cwd on executors
- denyRead / denyWrite / allowEnv / URL policy changes

## Success criteria

1. `mergePolicy("/cwd", { allowWrite: ["/w"] }, undefined).allowRead` is `["/cwd"]` (not `["/w"]`).
2. `createFileJail` omitted read still `[root]`; explicit read list does not gain write roots.
3. Escape-hatch `createNativeBashExecutor({ allowWrite })` omitted read still → `allowWrite`.
4. `gate.sh fast` green.
