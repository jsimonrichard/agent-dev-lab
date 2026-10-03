# Waterfall live-tick DOM cost

Status: in progress (adl-waterfall-perf / td705fa38). HANDOFF is the approved
goal; this file records the reuse survey and the one rendering approach.

## Goal

Stop the live clock from reconciling every dual-pane React row each tick, while
keeping `computeSpanWaterfallBar` as the source of bar geometry.

## Reuse survey

| Piece                                                  | Role                                                                                                              | Action                                                                                                      |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `apps/web/src/lib/workflow/workflow-waterfall.ts`      | Scale, `computeSpanWaterfallBar`, ticks                                                                           | Extend: axis CSS vars + `startMs`/`endMs` on bar segments. No D3/visx (helpers already do scale/join).      |
| `apps/web/src/components/app/workflow-tree-panel.tsx`  | Dual-pane rows, `useLiveNow` (1s `setState` + `startTransition`), memo comparators, scroll sync, hover `data-tip` | Keep dual-pane + comparators. Remove clock from panel React state. Apply axis vars on the waterfall column. |
| `apps/web/e2e/workflow-tree-inp.bench.spec.ts`         | Settled 10×8 INP                                                                                                  | Keep; add streaming scenario.                                                                               |
| `apps/web/e2e/fixture/src/workflows/wide-tree.ts`      | Sync-only tree                                                                                                    | Optional `leafDelayMs` (default 0) so a streaming bench can keep ~90 rows live.                             |
| `apps/web/e2e/fixture/src/workflows/tick-burst.ts`     | 40×50ms sequential steps                                                                                          | Streaming frame sample (narrower than wide-tree).                                                           |
| `apps/web/src/components/app/event-log-data-table.tsx` | `@tanstack/react-virtual`                                                                                         | Not reused: dual-pane scroll sync is load-bearing; virtualizing one pane without the other desyncs rows.    |
| `adl-split-workflow-tree-panel` (`t877b5370`)          | File split                                                                                                        | Out of scope; do not split this file here.                                                                  |

Dominant cost (from code, confirmed by bench): `useLiveNow` → `nowMs` in
`computeWaterfallScale` → `scale.spanMs` changes every second →
`scaleLooksSame` fails on **every** memoized row (tree + waterfall), including
completed steps. Running rows also fail `clockStillMatches`. Hover tips and
scroll sync are not on the 1s timer.

## Principles

- One approach: **CSS axis variables** on the waterfall pane, not canvas/SVG/D3.
- Bars stay `computeSpanWaterfallBar` output; CSS only reapplies that geometry
  when `--wf-span` / `--wf-now` change.
- Panel React state does not subscribe to the clock. Header tick labels and
  running duration text subscribe via `useSyncExternalStore`.
- Dual-pane scroll sync unchanged.

## Work

1. Baseline settled INP + streaming (tick-burst + delayed wide-tree) numbers.
2. Put `startMs`/`endMs` on bar segments; axis/segment CSS helpers + tests.
3. Drive `--wf-origin`/`--wf-span`/`--wf-now` from an interval without panel
   `setState`. Running segments use `--wf-end: var(--wf-now)`.
4. Keep copied-bar / nested-expand e2e; extend Playwright if selectors change.
5. Re-measure; `.claude/gate.sh full`.

## Out of scope

- D3/visx, canvas rewrite, splitting `workflow-tree-panel.tsx`, debugger/suspend.

## Success criteria

Same as HANDOFF: before/after numbers, live tick is not N×2 React list updates,
copied/nested e2e pass, full gate green.

## Measured (this machine, Chromium Playwright)

Settled 10×8 wide-tree (`ADL_INP_LABEL`):

| Metric                        | baseline     | css-axis     |
| ----------------------------- | ------------ | ------------ |
| select eventTiming p95 / mean | 216 / 144 ms | 184 / 115 ms |
| select bracketed rAF avg      | 131 ms       | 104 ms       |
| collapse eventTiming p95      | 216 ms       | 184 ms       |

Streaming:

| Scenario                           | baseline DOM mutations | css-axis | LoAF max     |
| ---------------------------------- | ---------------------- | -------- | ------------ |
| tick-burst                         | 580                    | 600      | 587 → 432 ms |
| delayed wide-tree (80ms×80 leaves) | 6035                   | 1524     | 215 → 239 ms |

Delayed wide-tree mutations dropped ~4× (clock no longer restyles every row). Remaining mutations are SSE inserting rows. Tick-burst is sequential append-bound; mutation count did not drop. Live select Event Timing often records 0 samples in both runs; use bracketed rAF.

Gap: LoAF still occurs on first hydrate / SSE bursts. Not a D3 rewrite. Dual-pane DOM node count unchanged (182 row nodes).
