# HANDOFF — adl-split-workflow-tree-panel

## Goal

Split `apps/web/src/components/app/workflow-tree-panel.tsx` (~2k lines) into focused modules without changing settled-tree click INP or live-run layout behavior.

## Principles

- Fail closed; one concern; plan first; state gaps.
- Split is mechanical. Do not “improve” waterfall rendering in this fork.

## Scope

1. Extract tree pane, waterfall pane, row components, and `PanelRowMenu` into sibling modules under the same feature folder.
2. Keep `workflowRowLooksSame`, `stepRowLooksSame`, `nestedRunRowLooksSame`, and `episodeRowLooksSame` intact (same fields, same semantics). They may move files; they must not be rewritten.
3. Re-run `ADL_INP_BENCH=1 bunx playwright test e2e/workflow-tree-inp.bench.spec.ts` from `apps/web` and record the number vs current.
4. Existing Playwright specs that cover the tree/waterfall (`retry-attempt.spec.ts` copied bars, nested expand) still pass.

## Out of scope

- Canvas / SVG / D3 waterfall rewrite (separate fork `adl-waterfall-perf`).
- JSON editor `showErrors`.
- `WorkflowStore` folder move.
- Debugger or suspend UI.

## Success criteria

1. `workflow-tree-panel.tsx` is no longer the single 2k-line owner of tree + waterfall + menus + comparators.
2. Memo comparators are unchanged in behavior; INP bench is not worse than the pre-split number on the same machine (quote both).
3. `.claude/gate.sh full` green.

## Constraints

- Layout math stays in `apps/web/src/lib/workflow/workflow-waterfall.ts`.
- Live-run timing is still unmeasured; do not claim streaming INP improved.

## Handoff notes

See [`structural-cleanup.md`](../structural-cleanup.md). Independent of the execution spine.
