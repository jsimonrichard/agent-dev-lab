# `@agent-dev-lab/web`

TanStack Start inspection UI for [Agent Dev Lab](https://agent-dev-lab.com). End users don't run this package directly — `adl init` adds it as a project dependency, and `adl dashboard` (from [`@agent-dev-lab/cli`](https://www.npmjs.com/package/@agent-dev-lab/cli)) starts it against the nearest `adl.config.*`. `adl dashboard --serve` runs the prebuilt Nitro output shipped in this package instead of Vite dev. Framework development on this repo points the dev server at `apps/playground` via `bun run dev:web`.

## Commands

From the monorepo root:

```bash
bun run dev:web    # Vite on :3000, `ADL_FRAMEWORK_DEV=1`, playground project
```

From this package:

```bash
bun --bun vite dev --port 3000
bun run build      # Nitro `.output` (needed before publishing the CLI)
bun run start      # Bun runtime (bun:sqlite) — local convenience
bun run start-node # Node runtime (better-sqlite3) — matches `adl dashboard --serve`
```

Framework UI **dev** uses `bun --bun vite` (Bun toolchain + hot reload). Production `vite build` stays on Node. The CLI’s `--serve` path runs `.output/server/index.mjs` with Node directly (not via `start`), using `better-sqlite3`.

## What it shows

- Project banner and dashboard (recent workflow runs and agent conversations)
- Workflow start (Zod input form), waterfall, step inspector, cancel
- SSE tails of persisted `RunEvent`s (`GET /api/runs/:id/events?afterSeq=` — cursor is per-run `runSeq`)
- Process event log (`GET /api/events?afterSeq=` — cursor is process-wide `logSeq`)
- Standalone agent chats, conversation titles, fork from a workflow episode

User-facing guide: [Inspection UI](https://agent-dev-lab.com/guides/inspection-ui/).

## Tests

Helper/reducer tests live next to the code (`src/lib/*.test.ts`) and run with Bun:

```bash
bun test src
```

They are wired into the root `turbo run test` task via this package's `"test"` script.
