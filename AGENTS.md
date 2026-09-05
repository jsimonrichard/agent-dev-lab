# AGENTS.md

## Cursor Cloud specific instructions

### Overview

Bun + Turborepo monorepo for an agentic workflow research framework.

| Package                     | Path              | Role                                                                              |
| --------------------------- | ----------------- | --------------------------------------------------------------------------------- |
| `@agent-dev-lab/web`        | `apps/web`        | TanStack Start (React 19) inspection UI — port 3000                               |
| `@agent-dev-lab/cli`        | `apps/cli`        | Stricli CLI (`adl`)                                                               |
| `@agent-dev-lab/playground` | `apps/playground` | Monorepo ADL project (`adl.config.ts`) for framework dev                          |
| `@agent-dev-lab/docs`       | `apps/docs`       | Astro Starlight API/project docs — port 4321                                      |
| `@agent-dev-lab/core`       | `packages/core`   | Headless core library (Vercel AI SDK); SQLite/ESLint/tsconfig via package exports |

### Commands

All standard commands are in root `package.json`:

- **Install**: `bun install`
- **Dev (all)**: `bun run dev` — runs web + docs in parallel via Turbo
- **Dev (web only)**: `bun run dev:web` — framework UI dev against `apps/playground` (`ADL_FRAMEWORK_DEV=1`)
- **Dev (CLI)**: `bun run dev:cli` — `adl dashboard` using the nearest user project from cwd
- **Dev (docs only)**: `bun run dev:docs` — docs on port 4321
- **Format**: `bun run format` — Prettier write across repo
- **Format check**: `bun run format:check` — Prettier check (CI uses this)
- **Lint**: `bun run lint` — ESLint across all packages
- **Typecheck**: `bun run typecheck` — TypeScript checking via Turbo
- **Test**: `bun run test` — Turbo `test` in packages that define it (`core`, `cli`, `web`)
- **Build**: `bun run build`

### Non-obvious notes

- Bun must be version 1.3.13 (declared in `packageManager` field). The update script installs it if missing.
- Nitro is the published `nitro` package (v3), pinned to `3.0.260610-beta` in root + `apps/web` + `overrides` to match [TanStack Start hosting](https://tanstack.com/start/latest/docs/framework/react/guide/hosting) (`npm install nitro`). Do not mix `nitro` and `nitro-nightly` — Bun will nest two copies and Vite/Nitro fail (`setModuleRunner`, `h3/rules`).
- Inspection UI **dev** uses the Bun toolchain (`bun --bun vite`). SQLite uses `bun:sqlite` under Bun and `better-sqlite3` under Node 22+ (`adl` no longer relaunches into Bun). Production `vite build` stays on Node; `start` / `--serve` run `.output` on Node.
- **Framework UI dev** (`bun run dev:web`): sets `ADL_FRAMEWORK_DEV=1` and defaults `ADL_PROJECT_ROOT` to `apps/playground`.
- **End-user / CLI** (`adl dashboard`): walks up from cwd for `adl.config.*`; no playground default. Sets `ADL_PROJECT_ROOT` and runs `vite dev`. `--serve` runs the built Nitro UI.
- End-user projects install `@agent-dev-lab/core`; the CLI loads it from the target project's `node_modules`. There is no `@agent-dev-lab/common` package — SQLite/ESLint/tsconfig are `@agent-dev-lab/core/db`, `./eslint`, and `./tsconfig/node.json`.
- SQLite database is auto-created at `.data/agent-dev-lab.sqlite` on first access — configurable via `ADL_SQLITE_PATH`. Event order is `run_seq` (same as `RunEvent.runSeq`).
- `apps/docs` — Starlight guides for cross-cutting concepts; TypeDoc API from `packages/core` JSDoc (`src/content/docs/api/` gitignored).
- `notes/` — coding-agent gap tracking only.
- No Docker, no external services required.
- CI runs lint and format checks via GitHub Actions (`.github/workflows/ci.yml`).
- Releases: `.github/workflows/release.yml` versions and publishes `@agent-dev-lab/core`, `@agent-dev-lab/cli`, and `@agent-dev-lab/web` via Changesets (docs and playground stay private).
- No `.env` file is required to load the repo. LLM API keys are needed to **execute** agents (playground `.env` / `.env.local`).

### Tests vs other files

- **`*.test.ts` / `*.e2e.test.ts`** — Bun tests (`bun test`).
- **`apps/cli/scripts/`** — build helpers, not tests (`verify-web-output.ts`, `package-scaffold.ts`). See `apps/cli/scripts/README.md`.
- **`packages/core/src/stores/store.contract.test.ts`** — shared store contract suite (test infra).
- **`packages/core/src/template/fixtures/`** — prompt fixtures used by template tests.

## House rules

These apply to **every** change, in every language. A narrower rule in
`.cursor/rules/` may override one of them; nothing else does. They exist because
each has come up repeatedly in review — following them up front saves a round.

### 1. No silent fallbacks

- If a state is impossible, **throw**. A fallback that hides a broken invariant
  is a defect even when it makes a test pass.
- If a permission, scope, or identity is unclear, **deny** — fail closed.
- A guard for a dangerous capability is a **required** argument, never an
  optional one with a safe-looking default.
- An error a user can hit must reach the **UI**, not only the log or console.
- Expected failures — validation, authorization, not-found, business rules — are
  not exceptions. Return them as data and display them.

Before writing `?? fallback`, an empty-collection return, or a `catch` that
swallows: decide whether the condition means an invariant broke. If it does,
throw instead.

### 2. Read upstream before writing a workaround

- Check what the framework, SDK, or platform already provides, and prefer its
  supported mechanism — **even at the cost of deleting local code that works**.
- If a workaround is genuinely needed, name the upstream mechanism you checked
  and why it did not work, in the commit body or PR description.
- Derive values from their authoritative source. A version, path, or expected
  value restated in a second place is a bug while it is still correct.
- Reach for a type guard before a cast, and for a documented API before
  coordinate math or DOM probing.
- A cross-cutting problem (release scripting, lockfiles, a Result type, a CI
  gate) may already be solved in a sibling repo. Port that solution rather than
  inventing a second one.

### 3. Generalize; do not special-case

- When a fix applies to one case, check whether the general rule holds for all
  cases and unify on **one path**. Two code paths where one would do is a defect
  even when both are correct.
- A host never branches on the identity of a plugin, extension, or backend. If
  it needs to know _which_ one it is handling, the contract is missing a hook —
  add the optional hook so every implementation can opt in.
- After a general fix lands, **delete** the special case or fallback it
  replaced. Leaving both is the most common way this rule half-lands.

### 4. One concern per change

- One concern per commit and per PR. Never batch unrelated modules.
- Migrating a pattern across N modules is N changes, not one.
- Stop at each step of a multi-step feature and hand back for review rather than
  running the whole plan.
- A change that is narrower than asked but complete beats a wider one that needs
  unpicking. If scope has to grow, say so and stop.

### 5. Plan before building anything substantial

Write the plan to a file first, in this shape:

- **Goal** — one paragraph.
- **Principles** — the decisions that constrain everything else, including what
  backward compatibility (if any) is actually required.
- **Numbered work sections** — in shipping order, one concern each.
- **Out of scope** — explicit non-goals.
- **Success criteria** — numbered and observable.

Get the plan reviewed before writing code. Correcting a plan is cheaper than
correcting an implementation.

### 6. State what is not done

- Report gaps, deferrals, and residual assumptions with the same specificity as
  the work. Never let a summary imply coverage the change does not have.
- If a check was skipped, say it was skipped. If a test fails, quote the output.
- Establish which checks were already failing **before** you started. Report an
  inherited failure as inherited; do not silently fix it inside an unrelated
  change, and do not let it mask yours.
- When touching docs, verify each claim against current behavior rather than
  against the surrounding prose. Correct stale claims and date the
  reconciliation.
- A plan or note that reality has overtaken gets a status banner saying what
  superseded it — not a quiet edit.

### Required outputs

Two things are part of the deliverable, not optional extras.

1. **Reuse survey — before writing code.** Name the existing modules, tables,
   routes, and helpers that already touch this area, and say which you are
   extending. If you are adding rather than extending, say why the existing
   abstraction did not fit.
2. **Diff shape — at handoff.** Report files changed and lines added/removed,
   and say what the change let you delete. A diff that adds far more than it
   removes is a signal to re-check, not a sign of progress.

## Where these bite in this repo

- **Layer first.** `packages/core` is headless. `apps/{cli,web,docs,playground}`
  are hosts. Logic that more than one host would need does not live in a host.
- **Rule 1** — `Result` from `packages/core/src/result.ts` for expected
  failures; throw only for broken invariants. Run failures must show in the
  inspection UI, not only the server console. Dangerous tools take their
  executor/sandbox as a required constructor argument.
- **Rule 2** — the AI SDK is upstream: prefer `stopWhen`, `stepCountIs`,
  `hasToolCall`, `prepareStep`, `activeTools` over anything hand-rolled, and
  check what it already does before adding a construct. Do not hardcode versions
  that `package.json` or the source already carries.
- **Rule 3** — new capabilities go on the observer/store interfaces, not into a
  conditional in `apps/web`. A second store backend extends
  `stores/store.contract.test.ts` rather than adding a parallel test file.
- **Rule 6** — gaps and deferrals go in `notes/` (agent- and release-facing
  only; never linked from `apps/docs`). Update `notes/v1-scope.md` and its
  `Last reconciled` date when the inventory changes.

Gate before every push: `bun run format:check`, `bun run lint`,
`bun run typecheck`, `bun run test`, `bun run build`. See
`.cursor/rules/pre-push-checks.mdc`.
