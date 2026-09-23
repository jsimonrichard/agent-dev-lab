# Nested-run follow-ups (after own `workflowRunId`)

**Status:** Open after **core 0.0.6** (own `workflowRunId` + step-cache namespace per nested `workflow.run()`). Last reconciled: **2026-09-22**.

Surfaced while adopting 0.0.6 in a consuming project. The run-row and cache fixes are correct; these are the gaps that remain.

Related: [workflows guide](../apps/docs/src/content/docs/core/workflows.md#nested-and-isolated-runs), [`WorkflowContext`](../packages/core/src/workflow/types.ts), [`MessageStore`](../packages/core/src/stores/types.ts), [`near-term-roadmap.md`](./near-term-roadmap.md).

---

## 1. No “am I the root of this invocation?” signal

A nested run's context still reports `stepId === null`, same as a root run. A workflow cannot tell whether it is the entry point or a phase invoked by something else.

Concrete case: `ctx.setTitle`. A composed pipeline wants each phase to title itself when started standalone, and stay quiet when nested. `stepId === null` was the only predicate, and it does not distinguish the two.

Before own-id nesting, wrapping nested calls in `ctx.step` (to work around shared step-cache) incidentally made `stepId` non-null inside the nested body. That workaround is gone; anyone who drops the wrappers after upgrading will find nested phases overwriting titles — now on their **own** run row (less damaging than retitling the parent), but still wrong for “title only when root.”

**Suggested fix:** expose the fact directly — `ctx.isRoot: boolean`, or preferably `ctx.parentRunId: string | null` (also lets a phase correlate with the invoker; that link is otherwise only on store rows / events, not on the live context).

---

## 2. `memoryScopeWithSuffix` keys the immediate run — silent conversation split

`ctx.memoryScopeWithSuffix(suffix)` is `${workflowRunId}:${suffix}` for **this** context's run. Nested runs used to inherit the parent's `workflowRunId`, so the same suffix across phases shared one `MessageStore` transcript by accident. With a new id per nest, each phase gets a fresh conversation. Nothing errors; the agent just stops remembering.

The 0.0.6 changelog describes own run ids but not this implication. Guides now state the formula and the cross-phase split. Still open as product work:

- Decide whether the helper should key on the **root** of the invocation tree (preserve the old, usually-intended span) while keeping distinct run rows. If both are wanted: root-scoped `memoryScopeWithSuffix` plus something like `ctx.runLocalScope(suffix)` for the immediate id.
- Until then, cross-phase agents should use an explicit stable scope (project-level id), not the helper.

See also [`retry-side-effects.md`](./retry-side-effects.md) (same formula vs new-attempt ids).

---

## 3. `MessageStore.copy` is required (compiler-caught)

**0.0.6** requires `MessageStore.copy(fromScope, toScope)` for skipped-step transcript restore. Custom or wrapping stores fail to typecheck until they implement it. Clean, compiler-caught break (unlike §2).

---

## Open decisions

1. Shape of the root/parent signal on `WorkflowContext` (`isRoot` vs `parentRunId` / `parentWorkflowRunId`).
2. Root-scoped vs run-local memory helpers (one API or two).
3. Whether attempt-forest “root” for memory is the same as `parentWorkflowRunId === null` (isolated helpers must stay out of that tree).
