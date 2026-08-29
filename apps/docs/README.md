# @agent-dev-lab/docs

Astro [Starlight](https://starlight.astro.build/) site with [starlight-typedoc](https://github.com/HiDeoo/starlight-typedoc) API reference for `@agent-dev-lab/core`.

## Commands

From the monorepo root:

```bash
bun run dev:docs    # localhost:4321
bun run build       # includes docs build via Turbo
```

## Content split

| Layer               | Path                                | Role                                                |
| ------------------- | ----------------------------------- | --------------------------------------------------- |
| **Guides**          | `src/content/docs/guides/`          | Project setup, inspection UI, orientation           |
| **Conceptual core** | `src/content/docs/core/`            | Runtime, agents, workflows, project (cross-cutting) |
| **API reference**   | `src/content/docs/api/` (generated) | TypeDoc from `packages/core` JSDoc                  |

Smaller single-API docs live as JSDoc on `packages/core` exports to avoid duplicating Starlight pages.

## TypeDoc

Configured in `astro.config.mjs` — entry point `packages/core/src/index.ts`. Regenerated on `astro dev` and `astro build`.
