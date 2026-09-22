# Run-tree INP: baseline vs light fixes

Measured 2026-09-22 on a synthetic `wide-tree` fixture run (10 groups × 8 leaves =
90 step rows; dual-pane → ~182 `[data-row-id]` nodes). Chromium via Playwright Event
Timing API (`durationThreshold: 0`) plus click→double-rAF brackets.

**Not CI.** Re-run:

```bash
cd apps/web
ADL_INP_BENCH=1 ADL_INP_LABEL=current bunx playwright test e2e/workflow-tree-inp.bench.spec.ts
```

Harness: `e2e/workflow-tree-inp.bench.spec.ts`, fixture workflow `wide-tree`.

## Variants

| Label                    | Code                                                                         |
| ------------------------ | ---------------------------------------------------------------------------- |
| `baseline-pre-light-inp` | `useLiveNow` @ 250ms (no `startTransition`); collapse `setState` sync        |
| `current`                | `useLiveNow` @ 1s + `startTransition`; collapse wrapped in `startTransition` |

Settled run (`status=completed`) — live clock idle in both variants, so the
interval change cannot affect these numbers.

## DOM scale (both variants, before interactions)

| Metric                  | Count |
| ----------------------- | ----- |
| `[data-row-id]`         | 182   |
| tooltip triggers        | 97    |
| context-menu-ish roots  | 181   |
| collapse/expand buttons | 15    |

Matches the plan’s structural diagnosis: **O(rows) Radix ContextMenu + Tooltip
wiring on a doubled tree/waterfall DOM**, not a small panel.

## Event Timing (closest to INP)

| Interaction             | baseline max / mean (ms) | current max / mean (ms) |
| ----------------------- | ------------------------ | ----------------------- |
| click (collapse sample) | 1256 / 529               | 1296 / 544              |
| click (select sample)   | 1256 / 321               | 1296 / 334              |
| contextmenu sample      | 64 / 53                  | 104 / 67                |

Max click durations stay ~1.3s in both — still “poor” INP territory. **Light
fixes did not move Event Timing on a settled wide tree.**

## Click → double-rAF bracket (main-thread until next paint opportunity)

| Interaction | baseline avg (ms) | current avg (ms) |
| ----------- | ----------------- | ---------------- |
| select      | 313               | 223              |
| collapse    | 171               | 57               |
| contextmenu | 205               | 166              |

Modest improvement under `startTransition` for collapse/select brackets; not
enough to clear a ~600–1300ms Event Timing ceiling.

## Conclusions

1. **Shipped light INP tweaks are insufficient** for settled-run tree jank. The
   live-clock throttle only matters while `status === "running"`.
2. **Per-row ContextMenu (~180 roots) and Tooltip (~97)** remain the dominant
   structural cost; next work should be shared menu / deferred tooltip (plan
   items left undone), or virtualization if those are not enough.
3. Local literature-review runs in playground SQLite are only ~5 steps — too
   small to reproduce the issue; use `wide-tree` (or a real large nested run)
   for further benches.
4. Collapse under ContextMenuTrigger needs care in automation (nested button
   `click()` can appear no-op until later frames); product path still toggles
   (row count dropped after the collapse loop).

## Memoized rows (2026-09-22)

`memo` on step, episode, nested, and workflow rows, with stable callbacks and
memoized ticks. Context-menu triggers use a `display: contents` wrapper so
Radix pointer handlers are not props of the memoized row (those handlers were
new every parent render, so `memo` never skipped).

Same bench, label `memo-rows`:

| Interaction      | before max / mean (ms) | memo max / mean (ms) |
| ---------------- | ---------------------- | -------------------- |
| click (collapse) | 1296 / 544             | 360 / 246            |
| click (select)   | 1296 / 334             | 360 / 246            |

Worst Event Timing dropped from ~1.3s to ~360ms. Still above the 200ms target.

Select still rebuilds step objects (`scale` / `step` / `ticks` identity changes
for every row), so unchanged rows cannot all skip. That rebuild is outside the
row components.

## Gaps

- No measurement while the run is **live** (where 250ms vs 1s `useLiveNow`
  would matter).
- No A/B of shared ContextMenu / single tooltip (not implemented).
- Single machine / single Chromium run — treat as directional, not a lab study.
