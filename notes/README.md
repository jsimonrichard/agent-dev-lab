# Coding-agent notes

Gap tracking and live design — not a changelog of shipped work. Never link this folder from `apps/docs`.

## Documentation split

| Layer                 | Location                                    | Contents                                           |
| --------------------- | ------------------------------------------- | -------------------------------------------------- |
| **Conceptual guides** | `apps/docs` Starlight `guides/` + `core/`   | User-facing layout, runtime, agents, workflows, UI |
| **API reference**     | `apps/docs` TypeDoc `/api/` + `/api/tools/` | JSDoc on `packages/core` and `packages/tools`      |
| **Gaps / deferred**   | `notes/` (this folder)                      | Open work and design that is not in the guides     |

`apps/docs` is the published site. Keep repo-only material here (and in `AGENTS.md`): playground / `dev:web`, `--local`, framework-dev modes, Changesets/release CI. JSDoc that TypeDoc publishes must not point at `notes/` or `apps/`.

Run locally: `bun run dev:docs` (port 4321).

## Files

| File                                             | Purpose                                                              |
| ------------------------------------------------ | -------------------------------------------------------------------- |
| [`near-term-roadmap.md`](./near-term-roadmap.md) | Open backlog and priority                                            |
| [`human-validation.md`](./human-validation.md)   | Pre-publish checklist                                                |
| [`tool-sandboxing.md`](./tool-sandboxing.md)     | `@agent-dev-lab/tools` threat model, remaining approval / macOS work |
| [`inspection-ui.md`](./inspection-ui.md)         | Control vs data plane, SSE, deferred streaming-tool UI               |
| [`tracing.md`](./tracing.md)                     | OTel spans vs AI SDK telemetry                                       |
| [`resumability.md`](./resumability.md)           | Step skip (shipped) vs crash-safe resume (not)                       |
| [`memory-pipeline.md`](./memory-pipeline.md)     | Deferred message shaping                                             |
| [`future-extensions.md`](./future-extensions.md) | Approvals, hooks, HTTP host                                          |
| [`workflow-catalog.md`](./workflow-catalog.md)   | Folder / tag / namespaced-id browsing                                |
| [`se-paper-framing.md`](./se-paper-framing.md)   | SE paper thesis, landscape, novelty plan                             |
