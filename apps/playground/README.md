# Playground

Hardcoded ADL project used when developing the inspection UI (`apps/web`) and CLI (`apps/cli`) inside the monorepo.

## Config

- `adl.config.ts` — same shape end users will place at their project root (see `@agent-dev-lab/runtime` `AdlProjectConfig`).
- `.adl/` — local project state (runs, caches, etc.) when we add persistence; gitignored.

## Run

```bash
bun run start
```

From the repo root, `bun run dev:web` points the UI at this directory via `ADL_PROJECT_ROOT`.
