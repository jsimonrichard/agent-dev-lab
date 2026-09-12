# @agent-dev-lab/docs

Astro [Starlight](https://starlight.astro.build/) site with [starlight-typedoc](https://github.com/HiDeoo/starlight-typedoc) API reference for `@agent-dev-lab/core` and `@agent-dev-lab/tools`.

## Commands

From the monorepo root:

```bash
bun run dev:docs    # localhost:4321
bun run build       # includes docs build via Turbo
```

## Content Split

| Layer               | Path                                | Role                                                |
| ------------------- | ----------------------------------- | --------------------------------------------------- |
| **Guides**          | `src/content/docs/guides/`          | Project setup, inspection UI, orientation           |
| **Conceptual Core** | `src/content/docs/core/`            | Runtime, agents, workflows, project (cross-cutting) |
| **API Reference**   | `src/content/docs/api/` (generated) | TypeDoc from `packages/core` and `packages/tools`   |

Smaller single-API docs live as JSDoc on `packages/core` exports to avoid duplicating Starlight pages.

## TypeDoc

Configured in `astro.config.mjs` — `packages/core/src/index.ts` → `/api/`, `packages/tools/src/index.ts` → `/api/tools/`. Regenerated on `astro dev` and `astro build`.
