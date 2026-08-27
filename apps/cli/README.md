# @agent-dev-lab/cli

Type-safe CLI built with [Stricli](https://bloomberg.github.io/stricli/). Requires **Bun** — the CLI relaunches itself with `bun --bun` when invoked via Node, because SQLite stores import `bun:sqlite`.

## Commands

| Command                               | Description                                                   |
| ------------------------------------- | ------------------------------------------------------------- |
| `adl init <dir>`                      | Scaffold a new ADL project                                    |
| `adl run <workflow-id> --input '{}'`  | Run a registered workflow                                     |
| `adl workflows list`                  | Print workflow ids                                            |
| `adl agents list`                     | Print agent ids                                               |
| `adl dashboard` (`adl d`, `adl dash`) | Inspection UI for the nearest `adl.config.*`                  |
| `adl dashboard --serve`               | Serve the prebuilt Nitro UI from `@agent-dev-lab/web/.output` |
| `adl dashboard --project <path>`      | Explicit ADL project root                                     |

Published installs default to the Nitro build when the web package has no Vite tree. Framework UI development against `apps/playground` uses `bun run dev:web` (sets `ADL_FRAMEWORK_DEV=1`).

## Development

```bash
bun run dev:cli
cd apps/cli && bun run dev -- workflows list
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
