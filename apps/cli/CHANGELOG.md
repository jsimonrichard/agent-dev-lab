# @agent-dev-lab/cli

## 0.0.1

### Patch Changes

- 75441e7: `adl agent run <agent-id> --input "…"` invokes a registered agent with a string user message (optional `--scope` for memoryScope).
- 51eddbc: Run `adl` on Node 22+ (SQLite via `better-sqlite3`) or Bun (`bun:sqlite`). Scaffold `dev` / `dashboard` scripts use `bun --bun adl dashboard` as the recommended toolchain.
- 5ca62f1: `adl init` copies the scaffold directory as-is (package.json, .gitignore, and `.env` are rewritten or skipped), including a real README and tsconfig. `--local` is a hidden flag for framework development. CLI typechecks include tests and scripts; `scripts/` holds build helpers, not tests.
- f0ffa5b: Ship `adl dashboard` (aliases `adl d`, `adl dash`) for the inspection UI. `--serve` runs the prebuilt Nitro build shipped with `@agent-dev-lab/web`.
- 096979e: Shared SQLite helpers, logging, ESLint, and tsconfig ship as `@agent-dev-lab/core` exports (`./db`, `./logging`, `./eslint`, `./tsconfig/node.json`). There is no separate `@agent-dev-lab/common` package.
- 28b2e4f: Include `@agent-dev-lab/web` in `adl init` projects so the inspection UI is a default dependency alongside the CLI and core.
- 28b2e4f: Add `adl init --local` for framework development: pin generated `@agent-dev-lab/*` deps to this checkout with `file:` + overrides. The flag is hidden in published CLI help.
- 97d0b80: Stop `adl dashboard --serve` from hanging when the CLI is signaled without a TTY (tests and `kill <pid>`).
- 52853d6: Initial public **0.0.1** alpha: SQLite-backed stores, `adl init` / `adl run` / list / `adl dashboard`, durable inspection UI, and sample scaffold workflows.
- Updated dependencies [2a9709b]
- Updated dependencies [12a08ea]
- Updated dependencies [87a2092]
- Updated dependencies [e80923b]
- Updated dependencies [e80923b]
- Updated dependencies [c71abcd]
- Updated dependencies [7a66e30]
- Updated dependencies [6b2863f]
- Updated dependencies [096979e]
- Updated dependencies [717e38a]
- Updated dependencies [6706aa0]
- Updated dependencies [30b00b8]
- Updated dependencies [52853d6]
- Updated dependencies [0514d20]
- Updated dependencies [e4a3e03]
- Updated dependencies [717e38a]
  - @agent-dev-lab/core@0.0.1
  - @agent-dev-lab/web@0.0.1
