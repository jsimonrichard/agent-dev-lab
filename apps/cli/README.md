<img src="https://raw.githubusercontent.com/jsimonrichard/agent-dev-lab/main/assets/brand/logo.svg" alt="" width="40" height="40" align="left" />

# @agent-dev-lab/cli

The `adl` CLI for [Agent Dev Lab](https://agent-dev-lab.com) — scaffold a project, run agents and workflows from the terminal, and launch the inspection UI. Type-safe CLI built with [Stricli](https://bloomberg.github.io/stricli/). Runs on **Node 22+** (SQLite via `better-sqlite3`) or **Bun** (SQLite via `bun:sqlite`) — neither is required over the other to use ADL. Bun is the default toolchain for the monorepo and for the scaffold's `dev`/`dashboard` scripts, but `npm` / Node work fine too.

## Usage

```bash
bunx @agent-dev-lab/cli init my-research
# or: npx @agent-dev-lab/cli init my-research
cd my-research
bun install
# or: npm install
cp .env.example .env   # then set OPENAI_API_KEY
bunx adl workflow run demo-counter --input '{"steps":3}'
bunx adl agent run assistant --input "What is Agent Dev Lab?"
bunx adl dashboard      # inspection UI
```

`adl init` scaffolds a project depending on `@agent-dev-lab/core` (and `@agent-dev-lab/web` for `adl dashboard`) — this package is not meant to be used standalone without those. After install, `bunx adl`, `npx adl`, or `node_modules/.bin/adl` all work (the `"bin"` entry is `adl`, not this package's own name) — `bunx`/`npx` resolve the local `node_modules/.bin` copy first, so no global install is needed.

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

Published installs default to the Nitro build when the web package has no Vite tree.

## Development

```bash
bun run dev:cli
cd apps/cli && bun run dev -- workflow list
```

Framework UI development against `apps/playground` uses `bun run dev:web` (sets `ADL_FRAMEWORK_DEV=1`).

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
