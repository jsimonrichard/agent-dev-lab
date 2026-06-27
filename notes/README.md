# Coding-agent notes

This directory is for **agent-oriented** tracking: v1 gaps, deferred design, and UI plans. Stable API documentation for implemented features lives in **`apps/docs`** (Astro Starlight + TypeDoc).

## Published docs (apps/docs)

| Topic            | Path                                                 |
| ---------------- | ---------------------------------------------------- |
| Overview         | `apps/docs/src/content/docs/guides/overview.md`      |
| Project setup    | `apps/docs/src/content/docs/guides/project-setup.md` |
| Runtime          | `apps/docs/src/content/docs/core/runtime.md`         |
| Agents           | `apps/docs/src/content/docs/core/agents.md`          |
| Workflows        | `apps/docs/src/content/docs/core/workflows.md`       |
| Templates        | `apps/docs/src/content/docs/core/templates.md`       |
| Project config   | `apps/docs/src/content/docs/core/project.md`         |
| Message store    | `apps/docs/src/content/docs/core/message-store.md`   |
| Observability    | `apps/docs/src/content/docs/core/observability.md`   |
| Streaming        | `apps/docs/src/content/docs/core/streaming.md`       |
| AI SDK checklist | `apps/docs/src/content/docs/core/ai-sdk.md`          |
| TypeDoc API      | generated at `apps/docs` dev/build → `/api/`         |

Run locally: `bun run dev:docs` (port 4321).

## Still in notes (not fully shipped or deferred)

| File                                             | Purpose                               |
| ------------------------------------------------ | ------------------------------------- |
| [`v1-scope.md`](./v1-scope.md)                   | Implementation checklist vs v1 target |
| [`design-overview.md`](./design-overview.md)     | Repo orientation for agents           |
| [`inspection-ui.md`](./inspection-ui.md)         | Planned `apps/web` SSE / waterfall    |
| [`tracing.md`](./tracing.md)                     | OTEL packaging decisions              |
| [`resumability.md`](./resumability.md)           | Episode cache, checkpoints (deferred) |
| [`memory-pipeline.md`](./memory-pipeline.md)     | Message-list shaping (deferred)       |
| [`future-extensions.md`](./future-extensions.md) | Approvals, hooks, RAG extensions      |

## Moved stubs

Files like `agent-api.md` now redirect to `apps/docs` — do not extend the old copies.
