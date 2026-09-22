# Structural cleanup (after this release)

**Status:** Deferred. Do not do this before the current publish. Last reconciled: **2026-09-22**.

These are the structures called out in the pre-release review. They are worth changing, and they are not release blockers. Each item is its own later change.

## `workflow-tree-panel.tsx`

`apps/web/src/components/app/workflow-tree-panel.tsx` is about 2,000 lines: the tree, the waterfall, row menus, and the memo comparators (`workflowRowLooksSame`, `stepRowLooksSame`, `nestedRunRowLooksSame`, `episodeRowLooksSame`) live in one file.

The shared `PanelRowMenu` replaced per-row menus. The comparators restate visible fields because that is what got settled wide-tree clicks under 200ms. Splitting the file is fine only if those two stay intact.

Re-check with `apps/web/e2e/workflow-tree-inp.bench.spec.ts` (`ADL_INP_BENCH=1`). That bench is not in CI. Live-run timing was never measured, so a split that only keeps the settled-tree number has not been checked against a run that is still streaming.

## `json-editor.tsx`

`apps/web/src/components/app/json-editor.tsx` is about the same size. `showErrors` is threaded through every field variant. That is how parse errors show on submit and stay hidden while typing. The repetition is the smell. The submit-time behavior is the contract (start-workflow form, document mode and raw JSON).

A later edit should stop drilling the flag by hand. It should not start showing errors on each keystroke.

## `retry-attempt.ts` and `WorkflowStore`

`packages/core/src/workflow/retry-attempt.ts` is one seed algorithm. Leave it as one algorithm.

The surface that grew is [`WorkflowStore`](../packages/core/src/observability/workflow-store.ts): `seedRetryAttempt`, `materializeAttemptRun`, `materializeAttemptStep`, `listStepRecords`, `listDescendantRuns`. A custom store implements every one of them. Do not add another required method family on top. The revisit is already in [`retry-side-effects.md`](./retry-side-effects.md).

[`WorkflowStore`](../packages/core/src/observability/workflow-store.ts) also sits in the wrong folder. It is not only an observer sink. `getStepOutput` is what a skipped step replays, and `seedRetryAttempt` writes the next attempt. That is the same kind of persistence as [`MessageStore`](../packages/core/src/stores/types.ts), which already lives in `packages/core/src/stores/`. Move `WorkflowStore` and its in-memory and SQLite implementations there. Leave the observer interfaces in `observability/`. This is a move, not a behavior change, and it is separate from the interface revisit above.

## `notes/tool-sandboxing.md`

[`tool-sandboxing.md`](./tool-sandboxing.md) mixes the threat model with a long writeup of what already shipped (ASRT, the executor split, the Node test path). Keep the threat model and the open decisions: the approval dispatcher, the macOS `sandbox-exec` backend, and the `writeFile` parent-directory jail gap. Those are also rows in [`near-term-roadmap.md`](./near-term-roadmap.md) §2. Carving the shipped diary out is its own edit, separate from any sandbox code change.
