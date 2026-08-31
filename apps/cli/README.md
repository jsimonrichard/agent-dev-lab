# @agent-dev-lab/cli

Type-safe CLI built with [Stricli](https://bloomberg.github.io/stricli/). Runs on **Node 22+** (SQLite via `better-sqlite3`) or **Bun** (SQLite via `bun:sqlite`). Bun remains the recommended install/dev toolchain for the monorepo and scaffolds.

## Commands

| Command                               | Description                                                   |
| ------------------------------------- | ------------------------------------------------------------- |
| `adl init <dir>`                      | Scaffold a new ADL project                                    |
| `adl workflow run <id> --input '{}'`  | Run a registered workflow (`adl w run`); `--input` is JSON    |
| `adl workflow list`                   | Print workflow ids (`adl w list`)                             |
| `adl agent list`                      | Print agent ids (`adl a list`)                                |
| `adl agent run <id> --input "…"`      | Run a registered agent (`adl a run`); `--input` is a string   |
| `adl dashboard` (`adl d`, `adl dash`) | Inspection UI for the nearest `adl.config.*`                  |
| `adl dashboard --serve`               | Serve the prebuilt Nitro UI from `@agent-dev-lab/web/.output` |
| `adl dashboard --project <path>`      | Explicit ADL project root                                     |

Published installs default to the Nitro build when the web package has no Vite tree. Framework UI development against `apps/playground` uses `bun run dev:web` (sets `ADL_FRAMEWORK_DEV=1`).

## Development

```bash
bun run dev:cli
cd apps/cli && bun run dev -- workflow list
```

From the source checkout, `adl init --local` pins `@agent-dev-lab/*` to this repo with `file:` + `overrides` so a throwaway project can `bun install` without npm. The flag is hidden in published CLI help.

```bash
bun apps/cli/src/bin/cli.ts init /tmp/my-research --local
```

## Build

`bun run build` verifies `@agent-dev-lab/web/.output` exists before compiling the CLI.

```bash
bun run build
./dist/cli.js --help
```
