# Nested-run follow-ups (after own `workflowRunId`)

**Status:** Resolved in Lane B (`notes/nested-run-context-plan.md`). Last reconciled: **2026-10-01**.

Surfaced while adopting 0.0.6 in a consuming project. The run-row and cache fixes were correct; the gaps below are closed.

Related: [workflows guide](../apps/docs/src/content/docs/core/workflows.md#nested-and-isolated-runs), [`WorkflowContext`](../packages/core/src/workflow/types.ts), [`MessageStore`](../packages/core/src/stores/types.ts), [`near-term-roadmap.md`](./near-term-roadmap.md).

---

## 1. Live parent / root signal — shipped

`WorkflowContext` exposes `parentWorkflowRunId: string | null` and `rootWorkflowRunId: string`. Nested bodies can gate on `parentWorkflowRunId === null` without reading the store. `stepId === null` remains true at every workflow body root and is **not** an entry-point predicate. `{ isolated: true }` stays parentless with `rootWorkflowRunId === workflowRunId`.

---

## 2. Memory helpers — root default + run-local — shipped

- `memoryScopeWithSuffix(suffix)` → `${rootWorkflowRunId}:${suffix}` (cross-phase default).
- `runLocalScope(suffix)` → `${workflowRunId}:${suffix}` (immediate run only).

Isolated helpers are their own root. Attempt-forest root for memory matches the invocation-tree root (`rootWorkflowRunId`).

**Residual (out of Lane B):** when a parent step that only `await`s a nested `run()` is skipped on retry, nested step frames are not re-entered, so transcripts those nested frames recorded are not carried by `carrySkippedMemoryScopes`. Writes that must survive that pattern should happen in a parent step that touches the message store (or accept an explicit stable scope). Related seed-forest work stays under [`retry-side-effects.md`](./retry-side-effects.md) / execution-control — not reworked here.

---

## 3. `MessageStore.copy` is required (compiler-caught)

**0.0.6** requires `MessageStore.copy(fromScope, toScope)` for skipped-step transcript restore. Custom or wrapping stores fail to typecheck until they implement it. Clean, compiler-caught break (unlike the former silent §2 split).
