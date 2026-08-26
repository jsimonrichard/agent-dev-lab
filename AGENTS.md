# AGENTS.md

## Cursor Cloud specific instructions

### Overview

Bun + Turborepo monorepo for an agentic workflow research framework.

| Package                     | Path              | Role                                                      |
| --------------------------- | ----------------- | --------------------------------------------------------- |
| `@agent-dev-lab/web`        | `apps/web`        | TanStack Start (React 19) inspection UI — port 3000       |
| `@agent-dev-lab/cli`        | `apps/cli`        | Stricli CLI (`adl`)                                       |
| `@agent-dev-lab/playground` | `apps/playground` | Monorepo ADL project (`adl.config.ts`) for framework dev  |
| `@agent-dev-lab/docs`       | `apps/docs`       | Astro Starlight API/project docs — port 4321              |
| `@agent-dev-lab/core`       | `packages/core`   | Headless core library (Vercel AI SDK, v1 API draft)       |
| `@agent-dev-lab/common`     | `packages/common` | Shared infra: Drizzle+SQLite, Pino logging, ESLint config |

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
- **Test**: `bun run test` — runs `bun test` in `packages/core`
- **Build**: `bun run build`

### Non-obvious notes

- Bun must be version 1.3.13 (declared in `packageManager` field). The update script installs it if missing.
- Nitro is the published `nitro` package (v3), pinned to `3.0.260610-beta` in root + `apps/web` + `overrides` to match [TanStack Start hosting](https://tanstack.com/start/latest/docs/framework/react/guide/hosting) (`npm install nitro`). Do not mix `nitro` and `nitro-nightly` — Bun will nest two copies and Vite/Nitro fail (`setModuleRunner`, `h3/rules`).
- Inspection UI **dev** must run under the Bun runtime (`bun --bun vite`) because SQLite stores import `bun:sqlite`. Production `vite build` stays on Node; `start` runs `.output` with Bun.
- **Framework UI dev** (`bun run dev:web`): sets `ADL_FRAMEWORK_DEV=1` and defaults `ADL_PROJECT_ROOT` to `apps/playground`.
- **End-user / CLI** (`adl dashboard`): walks up from cwd for `adl.config.*`; no playground default. Sets `ADL_PROJECT_ROOT` and runs `vite dev`. `--serve` runs the built Nitro UI.
- End-user projects install `@agent-dev-lab/core`; the CLI loads it from the target project's `node_modules`.
- SQLite database is auto-created at `.data/agent-dev-lab.sqlite` on first access — configurable via `ADL_SQLITE_PATH`.
- `apps/docs` — Starlight guides for cross-cutting concepts; TypeDoc API from `packages/core` JSDoc (`src/content/docs/api/` gitignored).
- `notes/` — coding-agent gap tracking only.
- No Docker, no external services required.
- CI runs lint and format checks via GitHub Actions (`.github/workflows/ci.yml`).
- No `.env` file is required to load the repo. LLM API keys are needed to **execute** agents (playground `.env` / `.env.local`).
