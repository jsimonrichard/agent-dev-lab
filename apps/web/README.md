# `@agent-dev-lab/web`

TanStack Start inspection UI for Agent Dev Lab. End users run it through `adl dashboard` (or `adl dashboard --serve` for the Nitro build). Framework development points at `apps/playground` via `bun run dev:web`.

## Commands

From the monorepo root:

```bash
bun run dev:web    # Vite on :3000, `ADL_FRAMEWORK_DEV=1`, playground project
```

From this package:

```bash
bun --bun vite dev --port 3000
bun run build      # Nitro `.output` (needed before publishing the CLI)
bun .output/server/index.mjs
```

Dev must use the Bun runtime (`bun --bun vite`) because SQLite stores import `bun:sqlite`. Production `vite build` stays on Node; `start` runs `.output` with Bun.

## What it shows

- Project banner and dashboard (recent workflow runs and agent conversations)
- Workflow start (Zod input form), waterfall, step inspector, cancel
- SSE tails of persisted `RunEvent`s (`GET /api/runs/:id/events`)
- Standalone agent chats, conversation titles, fork from a workflow episode

User-facing guide: [Inspection UI](https://agent-dev-lab.com/guides/inspection-ui/). Architecture notes: `notes/inspection-ui.md`.

## Tests

Helper/reducer tests live next to the code (`src/lib/*.test.ts`) and run with Bun:

```bash
bun test src
```

They are wired into the root `turbo run test` task via this package's `"test"` script.
