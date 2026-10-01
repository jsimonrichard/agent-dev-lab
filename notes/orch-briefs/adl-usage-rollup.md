## Goal

Surface aggregated token usage for workflow runs that contain agent calls at any nesting depth, then add `$` estimates from a pricing table / overrides — without inventing billing that ignores the rollup.

## Principles

- Fail closed — no silent fallbacks
- Upstream before workaround
- Generalize; don't special-case
- One concern per change
- Plan first
- State what is not done

## Scope

1. Roll up agent episode usage into workflow-run (and nested-forest) summaries readable by the inspector.
2. Define where the aggregate lives (projection vs on-read compute) — prefer one path, rebuildable from events.
3. `$` estimates only after rollup exists; pricing table / Gateway overrides as host or project config (not hardcoded secrets).
4. Tests for nested agent-call workflows; UI shows totals where agent-level usage already appears.
5. Changesets as needed.

## Out of scope

- Tool-call vs LLM wall-time breakdown (Lane I).
- Datasets / eval scorers.
- Mid-stream token resume.

## Success criteria

1. A nested workflow with agent calls shows non-empty aggregated token counts at the workflow-run level.
2. `$` estimate either ships with an explicit pricing source or is deferred with Rule 6 — but rollup must land either way.
3. `.claude/gate.sh full` green.

## Constraints

- Do not price without usage rollup.
- Derive usage from authoritative episode/event fields — do not restate counters in a second write path that can drift.

## Handoff notes

Parent plan lane map H. Roadmap §4 token counts / `$` estimates.
