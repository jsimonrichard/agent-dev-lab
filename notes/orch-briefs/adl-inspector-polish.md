## Goal

Close three inspection-UI observability gaps in one polish pass: waterfall timespan bars get a minimum visible width; tool-call vs LLM time is measurable in store/UI (not only OTel); and preliminary `agent_tool_result` events show live progress instead of a blank spinner until final.

## Principles

- Fail closed — no silent fallbacks
- Upstream before workaround
- Generalize; don't special-case
- One concern per change
- Plan first
- State what is not done

## Scope

1. **Waterfall min width** — short steps remain visible (CSS/layout); no fake durations in the store.
2. **Tool vs LLM time** — define the split using existing spans/events ([`tracing.md`](../tracing.md)); surface in store and/or inspector; do not require a new OTel exporter.
3. **Preliminary tool-result UI** — core already emits `preliminary`; chat/inspector should render intermediate progress ([`inspection-ui.md`](../inspection-ui.md)).
4. Prefer one PR if the touch set stays in `apps/web` (+ tiny core read helpers); split commits per concern if core event shapes change.
5. Changesets for user-facing packages.

## Out of scope

- Playwright coverage (Lane J).
- Usage/$ rollup (Lane H).
- Execution-control debugger UI.
- Structural tree-panel cleanup.

## Success criteria

1. Sub-pixel/short steps still show a visible bar.
2. A documented way exists to read tool-wait vs LLM-active time for an episode/run in the product (UI or API), not only raw OTel.
3. Preliminary tool results are visible before the final tool result.
4. `.claude/gate.sh full` green.

## Constraints

- Do not invent durations by padding stored timestamps.
- Hosts must not branch on agent plugin identity.

## Handoff notes

Parent plan lane map I. Roadmap §4 rows for waterfall min width, tool vs LLM time, preliminary tool-result UI.
