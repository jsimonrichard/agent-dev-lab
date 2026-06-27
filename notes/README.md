# Coding-agent notes

This directory is for **agent-oriented** tracking: v1 gaps, deferred design, and UI plans.

## Documentation split

| Layer                 | Location                                                                           | Contents                                                                     |
| --------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **Conceptual guides** | `apps/docs` Starlight `guides/` + `core/runtime`, `agents`, `workflows`, `project` | Cross-cutting patterns, project layout                                       |
| **API reference**     | `apps/docs` TypeDoc `/api/`                                                        | JSDoc on `packages/core` exports (`MessageStore`, `Template`, `RunEvent`, …) |
| **Gaps / deferred**   | `notes/` (this folder)                                                             | v1-scope, inspection-ui, resumability, …                                     |

Run locally: `bun run dev:docs` (port 4321).

## Starlight guides

| Topic          | Path                                                 |
| -------------- | ---------------------------------------------------- |
| Overview       | `apps/docs/src/content/docs/guides/overview.md`      |
| Project setup  | `apps/docs/src/content/docs/guides/project-setup.md` |
| Runtime        | `apps/docs/src/content/docs/core/runtime.md`         |
| Agents         | `apps/docs/src/content/docs/core/agents.md`          |
| Workflows      | `apps/docs/src/content/docs/core/workflows.md`       |
| Project config | `apps/docs/src/content/docs/core/project.md`         |

## TypeDoc (JSDoc on code)

Smaller single-API surfaces: `MessageStore`, `WorkflowStore`, `Template`, `RunEvent`, observers, AI SDK compatibility (`@packageDocumentation` on `packages/core/src/index.ts`).

## Still in notes

| File                                             | Purpose                  |
| ------------------------------------------------ | ------------------------ |
| [`v1-scope.md`](./v1-scope.md)                   | Implementation checklist |
| [`design-overview.md`](./design-overview.md)     | Repo orientation         |
| [`inspection-ui.md`](./inspection-ui.md)         | Planned web SSE          |
| [`tracing.md`](./tracing.md)                     | OTEL packaging           |
| [`resumability.md`](./resumability.md)           | Deferred resume          |
| [`memory-pipeline.md`](./memory-pipeline.md)     | Deferred shaping         |
| [`future-extensions.md`](./future-extensions.md) | Approvals, hooks         |

## Moved stubs

Older `*-api.md` files point at TypeDoc or Starlight — do not extend the old copies.
