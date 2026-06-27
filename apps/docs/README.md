# @agent-dev-lab/docs

Astro [Starlight](https://starlight.astro.build/) site with [starlight-typedoc](https://github.com/HiDeoo/starlight-typedoc) API reference for `@agent-dev-lab/core`.

## Commands

From the monorepo root:

```bash
bun run dev:docs    # localhost:4321
bun run build       # includes docs build via Turbo
```

From this package:

```bash
bun run dev
bun run build
bun run typecheck
```

## Content

| Directory                  | Purpose                                        |
| -------------------------- | ---------------------------------------------- |
| `src/content/docs/guides/` | Orientation and project setup                  |
| `src/content/docs/core/`   | Implemented runtime API (agents, workflows, …) |
| `src/content/docs/api/`    | **Generated** TypeDoc output (gitignored)      |

Coding-agent gap tracking remains in the repo root `notes/` directory.

## TypeDoc

Configured in `astro.config.mjs` — entry point `packages/core/src/index.ts`. The API sidebar is regenerated on `astro dev` and `astro build`.
