# @agent-dev-lab/cli

Type-safe CLI built with [Stricli](https://bloomberg.github.io/stricli/).

## Commands

| Command   | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `adl dev` | Start the inspection UI (`apps/web`) for an ADL project (default: playground) |

## Development

```bash
# From repo root
bun run dev:cli

# Or directly
cd apps/cli && bun run dev -- dev
```

## Build

```bash
bun run build
./dist/cli.js --help
```

### Inspection UI build prerequisite

`bun run build` runs `verify:web-output` first and requires `@agent-dev-lab/web/.output` (Nitro `server/index.mjs` + `public/`). From the repo root, `bun run build` via Turbo builds web before the CLI automatically.
