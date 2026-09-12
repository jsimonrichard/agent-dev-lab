# Plan: unify allowRead / allowWrite resolution

**Status:** proposal — review before code.  
**Date:** 2026-09-12

## Goal

One shared resolution path so omitted / bounded `allowRead` is consistent across bash
executors, pool, providers, and the file jail: **writes imply reads**, and the default
anchor is **cwd (bash) / root (file)**, not “copy of allowWrite alone” or “cwd alone.”

## Principles

1. **Write ⊆ read for bounded policies.** If a path is writable, it is readable unless
   reads are explicitly unbounded (`null` / `UNBOUNDED_ALLOW_READ`) or fail-closed empty
   (`[]` / file `null` for “nothing readable”).
2. **One resolver, thin call sites.** Delete parallel `?: allowWrite` / `?: [cwd]` /
   `?: [root]` ternaries; call sites only supply an _anchor_ and raw policy.
3. **Keep surface asymmetries that are real.** File `allowWrite` omitted = “no extra
   write bound (root only)”; bash `allowWrite` omitted at provider = `[cwd]`; executors
   still require `allowWrite`. Unbounded encoding stays: bash `null`, file
   `UNBOUNDED_ALLOW_READ` (normalize at the boundary).
4. **One concern per change.** Land the module + bash call sites first (or file first),
   not a mega-diff — but the _contract_ is decided once here.

## Desired resolved contract

After resolution (paths absolute, deduped):

| Input `allowRead`               | Result                                                           |
| ------------------------------- | ---------------------------------------------------------------- |
| omitted (`undefined`)           | `unique([anchor, ...allowWrite])`                                |
| explicit list                   | `unique([...list, ...allowWrite])` — write roots always included |
| `[]`                            | `[]` — fail closed; do **not** re-add write roots                |
| `null` / `UNBOUNDED_ALLOW_READ` | unbounded (`null` for bash / internal unbounded for jail)        |

`allowWrite` resolution (unchanged semantics, shared helper):

| Layer                        | Omitted `allowWrite`                    | `[]`                |
| ---------------------------- | --------------------------------------- | ------------------- |
| Bash provider `mergePolicy`  | `[anchor]` (cwd)                        | no writes           |
| Bash executor / pool         | required (no omit)                      | no host write binds |
| File jail extra `allowWrite` | `undefined` = root-only (no extra list) | no writes           |

`anchor` = `path.resolve(cwd)` for bash, `path.resolve(root)` for file.

## Why a common module (yes)

Today three omitted-read rules coexist:

| Site                 | Omitted `allowRead` today |
| -------------------- | ------------------------- |
| `mergePolicy`        | `[cwd]` only              |
| native / ASRT / pool | `allowWrite` only         |
| `createFileJail`     | `[root]` only             |

Providers usually mask the executor rule via `mergePolicy`, so escape-hatch executors and
pooled policy disagree. A shared helper with a small options bag is justified.

### Proposed module

`packages/tools/src/fs-bounds.ts` (name flexible — not under `file/` or `bash/` so both
import it without cycles).

```ts
export type AllowReadInput = string[] | null | typeof UNBOUNDED_ALLOW_READ | undefined;

export function resolveAllowWriteList(options: {
  anchor: string;
  allowWrite: string[] | undefined;
  /** `anchor` → default [anchor]; `required` → throw if omitted; `omit` → undefined */
  whenOmitted: "anchor" | "required" | "omit";
}): string[] | undefined;

export function resolveAllowReadList(options: {
  anchor: string;
  /** Already-resolved write roots (empty array ok). Ignored when read is unbounded/empty. */
  allowWrite: readonly string[];
  allowRead: AllowReadInput;
}): string[] | null; // null = unbounded
```

No mode enum branching on “bash vs file” — only `anchor`, `whenOmitted`, and the shared
read-union rule. Call sites stay responsible for sentinel mapping into describe APIs.

### Call-site map

1. `mergePolicy` → `resolveAllowWriteList({ whenOmitted: "anchor" })` then
   `resolveAllowReadList`
2. `canonicalizeBashSandboxPolicy` / native / ASRT → same read helper (`allowWrite`
   already required)
3. `createFileJail` → read helper with `anchor = root`, `allowWrite = options.allowWrite ?? []`
   for the _union only_; keep separate “extra write bound” as today (`undefined` vs `[]`)
4. `describeFileAccess` / `describeBashAccess` keep reporting resolved values; no second
   defaulting path

## Numbered work sections

1. **Add `fs-bounds.ts` + unit tests** for omitted / list∪write / `[]` / unbounded /
   dedupe / resolve relative to anchor.
2. **Bash:** wire mergePolicy, pool, native, ASRT; update tests that expected
   `allowRead === allowWrite` or `allowRead === [cwd]` alone.
3. **File jail:** wire `resolveAllowReadList`; update tests — including today’s
   “explicit allowRead different from allowWrite ⇒ write root not readable” (that becomes
   **write is readable**).
4. **Docs / changeset** (`tools-file-bash-workspace.md`, README): one paragraph on
   write ⊆ read and omitted = `[anchor, ...allowWrite]`.
5. **Workspace:** should fall out of executor describe + jail; add/adjust one test that
   omitted bash read can read both cwd and an extra allowWrite root via file tools.

## Out of scope

- Changing denyRead / denyWrite precedence
- Changing unbounded private-network / `allowEnv` rules
- Merging bash `null` and file `UNBOUNDED` into a single runtime type everywhere (keep
  boundary mapping)
- Making file `allowWrite` omitted mean `[root]` (still “extra bound omitted”)

## Success criteria

1. Provider path: omitted read with explicit `allowWrite: [w]` →
   `allowRead` contains **both** resolved cwd and `w`.
2. Escape-hatch executors: see open question on cwd (recommendation C).
3. No remaining hand-rolled omitted-read ternary in bash/file resolution paths.
4. `gate.sh fast` green; targeted executor + jail + provider tests updated.

## Open questions for review

1. Confirm **explicit** `allowRead: ["/only-this"]` with `allowWrite: [root]` should
   become readable-at-root (breaks current workspace test that enforces independence).
2. Executors have no cwd at construct time. Recommendation **C**: optional `cwd` on
   executor options / pool policy used only when `allowRead` is omitted →
   `unique([...(cwd ? [cwd] : []), ...allowWrite])`. Providers always pass cwd via
   mergePolicy. Escape hatches without cwd keep `unique(allowWrite)`.
3. Confirm `allowRead: []` stays deny-all and does **not** re-add write roots.
