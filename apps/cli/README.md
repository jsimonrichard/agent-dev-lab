# @agent-dev-lab/cli

Type-safe CLI built with [Stricli](https://bloomberg.github.io/stricli/).

## Commands

| Command                    | Description                                                                |
| -------------------------- | -------------------------------------------------------------------------- |
| `adl dev`                  | Inspection UI for the nearest `adl.config.*` from cwd (Vite, live project) |
| `adl dev --serve`          | Same, but runs the prebuilt Nitro UI from `@agent-dev-lab/web/.output`     |
| `adl dev --project <path>` | Explicit ADL project root                                                  |

Framework UI development against `apps/playground` uses `bun run dev:web` (sets `ADL_FRAMEWORK_DEV=1`), not `adl dev`.

## Development

```bash
bun run dev:cli
cd apps/cli && bun run dev -- dev
```

## Build

`bun run build` verifies `@agent-dev-lab/web/.output` exists before compiling the CLI.

```bash
bun run build
./dist/cli.js --help
```
