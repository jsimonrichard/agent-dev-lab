# @agent-dev-lab/cli

Type-safe CLI built with [Stricli](https://bloomberg.github.io/stricli/).

## Commands

| Command                              | Description                                                   |
| ------------------------------------ | ------------------------------------------------------------- |
| `adl init <dir>`                     | Scaffold a new ADL project                                    |
| `adl run <workflow-id> --input '{}'` | Run a registered workflow                                     |
| `adl workflows list`                 | Print workflow ids                                            |
| `adl agents list`                    | Print agent ids                                               |
| `adl dev`                            | Inspection UI for the nearest `adl.config.*`                  |
| `adl dev --serve`                    | Serve the prebuilt Nitro UI from `@agent-dev-lab/web/.output` |
| `adl dev --project <path>`           | Explicit ADL project root                                     |

Published installs default to the Nitro build when the web package has no Vite tree. Framework UI development against `apps/playground` uses `bun run dev:web` (sets `ADL_FRAMEWORK_DEV=1`).

## Development

```bash
bun run dev:cli
cd apps/cli && bun run dev -- workflows list
```

## Build

`bun run build` verifies `@agent-dev-lab/web/.output` exists before compiling the CLI.

```bash
bun run build
./dist/cli.js --help
```
