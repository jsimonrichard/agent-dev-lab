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

When a plan or note is fully landed, **delete it** (or shrink it to remaining open decisions). Do not keep resolved incident writeups or orch lane briefs after the work ships.

## Files

| File                                                       | Purpose                                                                                     |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| [`near-term-roadmap.md`](./near-term-roadmap.md)           | Open backlog and priority                                                                   |
| [`execution-control-plan.md`](./execution-control-plan.md) | Shepherd-shaped traces, step debugger, shared approval/suspend gate (design)                |
| [`mage-governance.md`](./mage-governance.md)               | MAGE-style review capacity — wave 0 before next effect/retry forks                          |
| [`ai-sdk-upgrade.md`](./ai-sdk-upgrade.md)                 | Plan: bump Vercel `ai` / `@ai-sdk/*` from v5 through v6 to v7                               |
| [`npm-release-candidates.md`](./npm-release-candidates.md) | Registry RCs: `*-rc.N` / `@rc` via Changesets `pre` + Publish RC workflow                   |
| [`tsk-handoffs/`](./tsk-handoffs/)                         | HANDOFF.md templates for `tsk task fork` (governance + execution spine + AI SDK)            |
| [`human-validation.md`](./human-validation.md)             | Pre-publish checklist                                                                       |
| [`tool-sandboxing.md`](./tool-sandboxing.md)               | `@agent-dev-lab/tools` threat model, remaining approval / macOS work                        |
| [`inspection-ui.md`](./inspection-ui.md)                   | Control vs data plane, SSE, deferred streaming-tool UI                                      |
| [`tracing.md`](./tracing.md)                               | OTel spans vs AI SDK telemetry                                                              |
| [`resumability.md`](./resumability.md)                     | Shipped attempt lineage + residual gaps; long-term shape → execution-control plan           |
| [`retry-side-effects.md`](./retry-side-effects.md)         | Skipped-step mutations, the appendable-list store limitation, `WorkflowStore`               |
| [`nested-run-followups.md`](./nested-run-followups.md)     | Shipped: live parent/root on context; root-scoped `memoryScopeWithSuffix` + `runLocalScope` |
| [`structural-cleanup.md`](./structural-cleanup.md)         | Post-release splits, and moving `WorkflowStore` into `stores/`                              |
| [`memory-pipeline.md`](./memory-pipeline.md)               | Deferred message shaping                                                                    |
| [`future-extensions.md`](./future-extensions.md)           | Approvals, hooks, HTTP host                                                                 |
| [`workflow-catalog.md`](./workflow-catalog.md)             | Folder / tag / namespaced-id browsing                                                       |
| [`se-paper-framing.md`](./se-paper-framing.md)             | SE paper thesis, landscape, novelty plan                                                    |
