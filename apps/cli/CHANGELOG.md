# @agent-dev-lab/cli

## 0.0.3

### Patch Changes

- 577a830: Fix `bun.lock`'s cached `workspaces[path].version` fields going stale after `changeset version` bumps a workspace package's version. `bun install` alone does not refresh that field for an unrelated dependency-graph change (a version bump with no dependency changes), so `bun pm pack` kept resolving internal `workspace:*` references to the old (or, once genuinely stale enough, a bogus `0.0.0`) version at publish time — this is what broke the `0.0.2` publish of `@agent-dev-lab/cli` and `@agent-dev-lab/web`, whose `@agent-dev-lab/core` dependency resolved to a nonexistent `0.0.0`.

  `scripts/patch-lock.ts` now runs as part of the `version` script and rewrites `bun.lock`'s workspace version fields directly from each workspace's `package.json`, independent of `bun install`'s incremental update behavior.

- Updated dependencies [577a830]
  - @agent-dev-lab/core@0.0.3
  - @agent-dev-lab/web@0.0.3

## 0.0.2

### Patch Changes

- 731bdb5: Fix `workspace:*` dependency ranges being published unresolved (e.g. `"@agent-dev-lab/core": "workspace:*"` in the published `@agent-dev-lab/cli` and `@agent-dev-lab/web` manifests), which broke installing these packages outside the monorepo. `changeset publish` only rewrites explicit workspace ranges (e.g. `workspace:^1.2.0`), not bare aliases like `workspace:*`, and plain `npm publish` has no concept of the `workspace:` protocol at all.

  Publishing now packs each package with `bun pm pack`, which resolves workspace protocol ranges to the real published version before handing the tarball to `npm publish`.

- Updated dependencies [731bdb5]
  - @agent-dev-lab/core@0.0.2
  - @agent-dev-lab/web@0.0.2

## 0.0.1

### Patch Changes

- 491f8a6: `adl agent run <agent-id> --input "…"` invokes a registered agent with a string user message (optional `--scope` for memoryScope).
- 491f8a6: Run `adl` on Node 22+ (SQLite via `better-sqlite3`) or Bun (`bun:sqlite`). Scaffold `dev` / `dashboard` scripts use `bun --bun adl dashboard` as the recommended toolchain.
- 491f8a6: `adl init` copies the scaffold directory as-is (package.json, .gitignore, and `.env` are rewritten or skipped), including a real README and tsconfig. `--local` is a hidden flag for framework development. CLI typechecks include tests and scripts; `scripts/` holds build helpers, not tests.
- 491f8a6: Ship `adl dashboard` (aliases `adl d`, `adl dash`) for the inspection UI. `--serve` runs the prebuilt Nitro build shipped with `@agent-dev-lab/web`.
- 491f8a6: Shared SQLite helpers, logging, ESLint, and tsconfig ship as `@agent-dev-lab/core` exports (`./db`, `./logging`, `./eslint`, `./tsconfig/node.json`). There is no separate `@agent-dev-lab/common` package.
- 491f8a6: Include `@agent-dev-lab/web` in `adl init` projects so the inspection UI is a default dependency alongside the CLI and core.
- 491f8a6: Add `adl init --local` for framework development: pin generated `@agent-dev-lab/*` deps to this checkout with `file:` + overrides. The flag is hidden in published CLI help.
- 491f8a6: Stop `adl dashboard --serve` from hanging when the CLI is signaled without a TTY (tests and `kill <pid>`).
- 491f8a6: Initial public **0.0.1** alpha: SQLite-backed stores, `adl init` / `adl run` / list / `adl dashboard`, durable inspection UI, and sample scaffold workflows.
- Updated dependencies [491f8a6]
- Updated dependencies [491f8a6]
- Updated dependencies [491f8a6]
- Updated dependencies [491f8a6]
- Updated dependencies [491f8a6]
- Updated dependencies [491f8a6]
- Updated dependencies [491f8a6]
- Updated dependencies [491f8a6]
- Updated dependencies [491f8a6]
- Updated dependencies [491f8a6]
- Updated dependencies [491f8a6]
- Updated dependencies [491f8a6]
- Updated dependencies [491f8a6]
- Updated dependencies [491f8a6]
- Updated dependencies [491f8a6]
- Updated dependencies [491f8a6]
  - @agent-dev-lab/core@0.0.1
  - @agent-dev-lab/web@0.0.1
