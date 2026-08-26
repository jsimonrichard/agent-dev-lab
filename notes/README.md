# Coding-agent notes

This directory is for **agent-oriented** tracking: RC remaining work, deferred design, and UI architecture.

## Documentation split

| Layer                 | Location                                  | Contents                                          |
| --------------------- | ----------------------------------------- | ------------------------------------------------- |
| **Conceptual guides** | `apps/docs` Starlight `guides/` + `core/` | Layout, runtime, agents, workflows, inspection UI |
| **API reference**     | `apps/docs` TypeDoc `/api/`               | JSDoc on `packages/core` exports                  |
| **Gaps / deferred**   | `notes/` (this folder)                    | RC remaining work, resumability, UI architecture  |

Run locally: `bun run dev:docs` (port 4321).

## Starlight guides

| Topic          | Path                                                 |
| -------------- | ---------------------------------------------------- |
| Overview       | `apps/docs/src/content/docs/guides/overview.md`      |
| Project setup  | `apps/docs/src/content/docs/guides/project-setup.md` |
| Inspection UI  | `apps/docs/src/content/docs/guides/inspection-ui.md` |
| Runtime        | `apps/docs/src/content/docs/core/runtime.md`         |
| Agents         | `apps/docs/src/content/docs/core/agents.md`          |
| Workflows      | `apps/docs/src/content/docs/core/workflows.md`       |
| Project config | `apps/docs/src/content/docs/core/project.md`         |

## TypeDoc (JSDoc on code)

Smaller single-API surfaces: `MessageStore`, `WorkflowStore`, `Template`, `RunEvent`, observers, AI SDK compatibility (`@packageDocumentation` on `packages/core/src/index.ts`).

## Still in notes

| File                                             | Purpose                                    |
| ------------------------------------------------ | ------------------------------------------ |
| [`v1-scope.md`](./v1-scope.md)                   | RC inventory, remaining work, validation   |
| [`design-overview.md`](./design-overview.md)     | Repo orientation                           |
| [`inspection-ui.md`](./inspection-ui.md)         | Control vs data plane, SSE, client reducer |
| [`tracing.md`](./tracing.md)                     | OTel spans vs AI SDK telemetry             |
| [`resumability.md`](./resumability.md)           | Run retry / step skip (memory is separate) |
| [`memory-pipeline.md`](./memory-pipeline.md)     | Deferred shaping                           |
| [`future-extensions.md`](./future-extensions.md) | Approvals, hooks                           |
| [`workflow-catalog.md`](./workflow-catalog.md)   | Folder / tag / namespaced-id browsing      |
| [`se-paper-framing.md`](./se-paper-framing.md)   | SE paper thesis, landscape, novelty plan   |
