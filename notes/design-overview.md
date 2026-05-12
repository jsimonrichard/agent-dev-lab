# Agent Development Lab — design handoff

Concise summary of the **Agentic Workflow Research Framework** (full brief was used for initial repo setup).

## Purpose

TypeScript-first toolkit to **author, run, and inspect** multi-agent workflows for research: fast iteration, strong execution visibility (including nested agents), UI-first inspection, **headless runtime** (no React/browser in core), **colocated** workflow code and markdown prompts (templating, no MDX / no custom frontmatter v1).

Not a large “agent platform” — small, flexible core.

## Monorepo (Bun)

| Path | Role |
|------|------|
| `apps/web` | TanStack Start — inspection UI for runs, logs, conversations (to be built out). |
| `apps/docs` | Astro + Starlight + **starlight-typedoc** — project + API docs. |
| `packages/runtime` | Headless library — Vercel AI SDK, prompt load/render helpers; future workflow execution. |
| `packages/common` | Drizzle + SQLite (Bun), logging (pino), OTEL placeholder, **shared ESLint** entry. |

No top-level `prompts` package — prompts live beside code or in tests.

## Principles

- **Runtime/UI split**: workflows runnable from scripts/tests/server; UI reads persisted output, does not own execution.
- **Defer**: final workflow context API, DB schema, conversation/replay model, prompt templating API surface, observability event schema — but **do not assume a flat run model** (nested activity and conversations must remain possible).
- **Observability direction**: OpenTelemetry + structured logs/events; all agent threads should be representable in the UI later.

## Tooling

Root: `bun install`, `bun run dev` / `dev:web` / `dev:docs`, `bun run build`, `bun run lint`, `bun run typecheck`, `bun --cwd packages/runtime test`.

**Nitro + Bun**: root declares `"nitro": "npm:nitro-nightly@latest"` so Nitro’s Vite plugin can resolve the `nitro` package when hoisted from Bun’s store.

## Generated docs

`apps/docs/src/content/docs/api/` is **gitignored**; it is produced by `astro build`, `astro check`, or `astro dev`.

## Open questions (unchanged)

Workflow context API, DB schema, conversation storage, replay/substeps, prompt templating API details, observability event model — documented as deferred, not decided in scaffold.
