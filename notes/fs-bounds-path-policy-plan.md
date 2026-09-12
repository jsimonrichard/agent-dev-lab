# Plan: PathBound + allow/deny-only file jail + `denyWrite`

## Goal

One shared allow/deny path-policy type and judge in `fs-bounds`. Refit `createFileJail` so
security is **only** allow/deny lists (plus a non-security `cwd` for relative paths) —
drop the privileged write `root` and the `allowWrite` ∩ `root` special case. Wire
`denyWrite` through file tools / provider / workspace describe.

## Principles

1. **Deny wins over allow** (including unbounded read allow). Same tie-break as bash/ASRT.
2. **Jail security = two `PathBound`s** (read + write). No third “must also be under root”
   check. `cwd` is only the relative-path anchor (and what search passes as executor cwd).
3. **`cwd` is optional** — default `os.homedir()` (the `~` meaning; never a literal `"~"`
   string, and not `/`). `/` as a relative base turns `foo` into `/foo` and would make
   omit→`[cwd]` host-wide; home is the least-surprising non-security default.
4. **Omit → `[cwd]` for both allow lists** at the jail (same as
   `resolveAllowReadList` / `resolveAllowWriteList`). With the default cwd, a bare
   `createFileJail()` is therefore a **home-directory** sandbox. `[]` / `null` (read) =
   allow nothing. No more write `allowWrite: undefined` meaning “skip the allow list.”
   Factories with an explicit sandbox dir keep passing that dir as `cwd` and/or as the
   resolve anchor so omit stays `[sandbox]`, not home.
5. **Absolute paths OK for writes** when they fall under `allowWrite` (same rule as reads).
   Today writes reject absolutes; that restriction goes away with the root special case.
6. **Pure judge; shared prep helpers beside it.** `checkPathAccess` is string-only (no I/O,
   no `AdlError`). `realpathOrResolve` / `realpathPathBound` live in `fs-bounds` for bound
   prep. Jail maps denial reasons → `AdlError`.
7. **Do not invent bash-native `denyWrite`.** Pool still refuses non-empty `denyWrite` on
   native.
8. **One concern per jj change** (sections below).

## Why this API

| Before                                             | After                                           |
| -------------------------------------------------- | ----------------------------------------------- |
| Write ∩ `root` always, optional extra `allowWrite` | Write = `allowWrite` + `denyWrite` only         |
| Omit `allowWrite` ≠ `[]` (skip vs deny-all)        | Omit → `[cwd]`; `[]` → nowhere — one rule       |
| Absolute writes forbidden                          | Absolute writes allowed if under `allowWrite`   |
| `root` overloaded (security + relative base)       | `cwd` = relative base only; default `homedir()` |

Expressiveness unchanged: single-dir sandbox is `allowRead`/`allowWrite` defaulting to
`[cwd]`. Multi-root write is just a longer `allowWrite` list — no intersection with a
phantom root. Bare jail with no args ≈ home sandbox (because omit allows follow default cwd).

## Reuse survey

| Existing                                  | Role                                                                      |
| ----------------------------------------- | ------------------------------------------------------------------------- |
| `fs-bounds.ts`                            | Keep resolve helpers; add `PathBound` + judge + `realpathOrResolve`       |
| `file/jail.ts`                            | Become thin: resolve paths against `cwd`, realpath, `checkPathAccess`     |
| Bash / workspace `allowWrite`/`denyWrite` | Pass through to jail as the write bound                                   |
| `FileAccessInfo`                          | Add `allowWrite` + `denyWrite` (concrete lists; omit reports `[cwd]`)     |
| `createFileTools` / provider `root`       | Keep name as factory sugar → jail `cwd` + default allows, or rename later |

## Target jail shape

```ts
createFileJail(options?: {
  /**
   * Relative-path base only — not a security root.
   * Omitted → `os.homedir()` (expanded `~`, not `/`).
   */
  cwd?: string;
  allowRead?: FileAllowRead; // omit → [cwd]; null/[] → []; "**" → unbounded
  denyRead?: string[];
  allowWrite?: string[]; // omit → [cwd]; [] → no writes
  denyWrite?: string[];
}): FileJail;

interface FileJail {
  readonly cwd: string; // was `.root`; always absolute (resolved)
  resolveExisting(path: string): Promise<string>;
  resolveForWrite(path: string): Promise<string>;
}
```

Factories keep `root` (or migrate to `cwd`) as the value passed into `cwd` / omit defaults
so workspace/file tools do not silently fall back to the home directory.

## Numbered work sections

### 1. `fs-bounds`: path helpers + `PathBound` + judge (+ `realpathOrResolve`)

```ts
function isWithinRoot(candidate: string, root: string): boolean;

/** Allow list for a bound. Write side never uses UNBOUNDED. */
type PathAllow = typeof UNBOUNDED_ALLOW_READ | readonly string[];

type PathBound = {
  allow: PathAllow;
  deny: readonly string[];
};

type PathAccessDenial = { kind: "denied"; denyRoot: string } | { kind: "outside-allow" };

function checkPathAccess(candidate: string, bound: PathBound): PathAccessDenial | undefined;

function resolveDenyList(paths: readonly string[] | null | undefined): string[];
function realpathOrResolve(p: string): Promise<string>;
function realpathPathBound(bound: PathBound): Promise<PathBound>;
```

- No `allow: undefined` — omitted write allow is resolved to `[cwd]` before building the bound.
- Unit tests for judge + `realpathOrResolve`. No caller behavior change yet.

### 2. File jail: allow/deny-only API

- Switch to `createFileJail({ cwd?, allowRead, denyRead, allowWrite, denyWrite })`.
- Default `cwd` to `path.resolve(os.homedir())` when omitted.
- Drop hard root confine and absolute-write rejection.
- Relative paths: `path.resolve(cwd, requested)`; absolute: `path.resolve(requested)`.
- Writes: parent must exist; leaf symlink check kept; both checked with write `PathBound`.
- Rename `FileJail.root` → `FileJail.cwd` (update search’s `cwd: jail.root`).
- Update jail tests for new semantics (incl. absolute write under `allowWrite`, denyWrite,
  default-cwd / home-sandbox behavior).

### 3. Wire factories / provider / workspace / describe / docs

- Pass `denyWrite` through tools, provider, cache key, workspace from executor describe.
- `FileAccessInfo`: `allowWrite: string[]`, `denyWrite: string[]` (omit → `[cwd]` / `[]`).
- Search: still read-only (`denyRead` only); uses jail `cwd`.
- README, guides/tools.md, changeset.
- Call-site updates for `createFileJail(root, …)` → options object.

## Out of scope

- Auto-union write⊆read.
- Native bash `denyWrite`.
- Unbounded writes (`"**"` on write).
- FD-based TOCTOU fix.
- Renaming every factory `root` → `cwd` in one go (jail rename is required; factory alias OK).
- ASRT/bwrap mount logic in `fs-bounds`.

## Success criteria

1. Jail has no privileged security root — only allow/deny (+ `cwd` for relatives).
2. `denyWrite` enforced on file write/edit; workspace bash `denyWrite` applies to file tools.
3. Omit `allowWrite` ≡ `[cwd]`; `[]` ≡ no writes; describe reports concrete lists.
4. Absolute write under `allowWrite` (outside former “root”) succeeds.
5. Path math / judge / `realpathOrResolve` live in `fs-bounds`; jail duplicates gone.
6. Gate `fast` per section; `full` before push.

## Resolved (was open)

**Describe omit `allowWrite`:** always report `[cwd]` — same as `allowRead`.

**Default `cwd`:** `os.homedir()`, not `/`. Literal `"~"` is not a path — expand via
`homedir()`. Omit allows still follow `[cwd]`, so a fully omitted jail is a home sandbox;
factories with an explicit project/sandbox dir must keep passing it.
