# Agent Development Lab — design handoff

Concise summary of the **Agentic Workflow Research Framework** (full brief was used for initial repo setup).

## Purpose

TypeScript-first toolkit to **author, run, and inspect** multi-agent workflows for research: fast iteration, strong execution visibility (including nested agents), UI-first inspection, **headless runtime** (no React/browser in core), **colocated** workflow code and markdown prompts (templating, no MDX / no custom frontmatter v1).

Not a large “agent platform” — small, flexible core.

## Monorepo (Bun)

| Path               | Role                                                                                     |
| ------------------ | ---------------------------------------------------------------------------------------- |
| `apps/web`         | TanStack Start — inspection UI for runs, logs, conversations (to be built out).          |
| `apps/docs`        | Astro + Starlight + **starlight-typedoc** — project + API docs.                          |
| `packages/runtime` | Headless library — Vercel AI SDK, prompt load/render helpers; future workflow execution. |
| `packages/common`  | Drizzle + SQLite (Bun), logging (pino), OTEL placeholder, **shared ESLint** entry.       |

No top-level `prompts` package — prompts live beside code or in tests.

## Principles

- **Runtime/UI split**: workflows runnable from scripts/tests/server; UI reads persisted output, does not own execution.
- **Defer**: final workflow context API, DB schema, conversation/replay model, prompt templating API surface, observability event schema — but **do not assume a flat run model** (nested activity and conversations must remain possible).
- **Observability direction**: OpenTelemetry + structured logs/events; all agent threads should be representable in the UI later.

## Tooling

Root: `bun install`, **`bun run dev`** (Turbo runs all `dev` scripts — web + docs in parallel), `bun run dev:web` / `bun run dev:docs` for a single app, **`bun run build`** / `typecheck` / `test` via Turborepo, `bun run lint` (root ESLint, repo-wide globs).

**Nitro + Bun**: root declares `"nitro": "npm:nitro-nightly@latest"` so Nitro’s Vite plugin can resolve the `nitro` package when hoisted from Bun’s store.

## Generated docs

`apps/docs` gitignores `src/content/docs/api/`; that folder is produced by `astro build`, `astro check`, or `astro dev`.

## API design notes (draft)

| Doc | Topic |
|-----|--------|
| [`agent-api.md`](./agent-api.md) | Agents, `run()`, templates, context → AI SDK |
| [`workflow-api.md`](./workflow-api.md) | Steps, nesting, tracing, templates, nested workflows |
| [`project-api.md`](./project-api.md) | `adl.config` registries, `workflow.run`, CLI entrypoints |
| [`streaming-api.md`](./streaming-api.md) | Run events, `agent.stream`, UI SSE |
| [`message-store.md`](./message-store.md) | `MessageStore` contract (planned; not in code yet) |
| [`memory-pipeline.md`](./memory-pipeline.md) | Deferred message-list shaping |

## Open questions (unchanged)

Workflow context API — see [`workflow-api.md`](./workflow-api.md). DB schema, conversation storage, replay/substeps, observability event model beyond step events — still deferred in code.
