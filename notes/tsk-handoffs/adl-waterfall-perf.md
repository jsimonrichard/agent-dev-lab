# HANDOFF — adl-waterfall-perf

## Goal

Make the inspection-UI workflow waterfall less laggy on live and wide trees by reducing dual-pane DOM work. Measure first. Do not start with a D3 rewrite.

## Principles

- Fail closed; one concern; plan first; state gaps.
- Layout math in `workflow-waterfall.ts` stays the source of bar geometry unless measurement proves it is the bottleneck.
- Prefer the platform (React memo already in tree panel, existing INP bench) before a new visualization library.

## Scope

1. Baseline: `ADL_INP_BENCH=1` settled wide-tree (`workflow-tree-inp.bench.spec.ts`) plus at least one **streaming** run (tick-burst or equivalent). Quote interaction timings.
2. Identify the dominant cost (row count × two panes, `nowMs` bar updates, scroll sync, hover tips).
3. Change rendering so the time axis does not remount/update N React row nodes every tick if that is the cost: canvas or SVG bars, virtualization, or CSS transforms — one approach, justified by the baseline.
4. Keep selection, menus, retry, copied-bar layout, and nested expand working; extend Playwright where the DOM contract changes.
5. Re-measure and quote after.

## Out of scope

- Adopting D3/visx unless the chosen approach needs a scale/join helper _and_ the existing `workflow-waterfall.ts` helpers are insufficient (name what was checked).
- Splitting `workflow-tree-panel.tsx` for file size (`adl-split-workflow-tree-panel`). Coordinate if both land: comparators stay.
- Debugger, suspend, store moves.

## Success criteria

1. Written before/after numbers for settled INP bench and a streaming scenario.
2. Live waterfall no longer feels like a full dual-pane React list ticking every interval on the wide-tree fixture (or the gap is documented with numbers if hardware-bound).
3. Copied-bar / nested-expand e2e still pass.
4. `.claude/gate.sh full` green.

## Constraints

- Dual-pane scroll sync is load-bearing; do not drop it.
- Do not put visualization library identity in the host as a special case — bars remain data from `computeSpanWaterfallBar`.

## Handoff notes

Independent of the execution spine. Can land before or after the tree-panel split; if split is in flight, wait or rebase rather than editing both in one change.
