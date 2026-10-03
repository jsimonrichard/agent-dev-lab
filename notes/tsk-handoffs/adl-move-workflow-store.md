# HANDOFF — adl-move-workflow-store

## Goal

Move `WorkflowStore` and its in-memory / SQLite implementations from `packages/core/src/observability/` to `packages/core/src/stores/`. Persistence, not observer sink.

## Principles

- Fail closed; one concern; plan first; state gaps.
- Move only. No new required store methods.

## Scope

1. Relocate `workflow-store.ts`, `in-memory-workflow-store.ts`, `sqlite-workflow-store.ts`, and their tests.
2. Leave observer interfaces in `observability/`.
3. Update package exports, imports, and docs/JSDoc that point at the old path.
4. Keep `retry-attempt.ts` as one algorithm; do not grow `WorkflowStore`.

## Out of scope

- Interface revisit in [`retry-side-effects.md`](../retry-side-effects.md) (skipped-step file mutations, extra method families).
- `SuspendStore` (spine fork).
- Tree-panel split.

## Success criteria

1. `MessageStore` and `WorkflowStore` live under `packages/core/src/stores/`.
2. Custom-store implementors still implement the same methods; public API names unchanged aside from import path if that was exported.
3. `.claude/gate.sh full` green.

## Constraints

- Prefer existing `stores/` patterns over a second persistence root.
- Derive re-exports from the new location if a short compatibility export is required; do not leave two sources of truth.

## Handoff notes

See [`structural-cleanup.md`](../structural-cleanup.md). Independent of suspend/debugger.
