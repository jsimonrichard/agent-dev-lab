## Goal

Produce a reviewed design for Shepherd-shaped execution control in ADL: an effect gate (intent before materialize), trace-cursor re-entry that can eventually replace ad-hoc retry extensions, and a step-debugger model (granularity + DAP direction) that shares the same suspend primitive as human approval — without shipping the full feature yet.

## Principles

- Fail closed — no silent fallbacks
- Upstream before workaround
- Generalize; don't special-case
- One concern per change
- Plan first
- State what is not done

## Scope

1. **Own and deepen** [`notes/execution-control-plan.md`](../execution-control-plan.md) against [Shepherd (arXiv:2605.10913)](https://arxiv.org/abs/2605.10913): map Task / Effect / Scope / Trace onto ADL's workflows, events, stores, and `@agent-dev-lab/tools` sandboxes; record what we deliberately will not clone (Docker CoW-first, Python decorator agents).
2. **API sketch** (types + call sites only) for: effect intent/outcome, handler chain, suspend handle, trace cursor, and a compatibility wrap of today's `seedRetryAttempt({ fromStepId })`.
3. **Debugger design:** granularity ladder L1–L4 (step / episode / effect / host JS); default product = L1–L3; DAP server sketch for VS Code vs inspection-UI client; state how L4 stays "attach Node inspector," not ADL-owned.
4. **Approval reuse:** show that `ApprovalDispatcher` / `ctx.requestApproval` are adapters over the same gate (update cross-links in `future-extensions.md` / `tool-sandboxing.md` open-questions only as needed).
5. **Open decisions** listed with maintainer-facing recommendations; stop for review before implementation PRs.

## Out of scope

- Implementing the gate, debugger UI, DAP server, or env CoW.
- Rewriting shipped attempt lineage / inspector Retry.
- Lanes B–J feature work.
- Todo tool, datasets, structural cleanup.

## Success criteria

1. `notes/execution-control-plan.md` is the single status document; [`resumability.md`](../resumability.md) banner stays accurate.
2. Written API sketch covers gate + cursor + suspend; approval and debugger both call it.
3. Debugger section names default granularity and a DAP integration path (or an explicit rejection with rationale).
4. Open decisions are numbered and ready for human review; no production code required for this lane's first handoff.
5. `.claude/gate.sh fast` green if any note/doc edits land (full gate if code spikes are added later).

## Constraints

- **Design-first.** Do not land a parallel pause API that Lane E would have to throw away.
- Immutable prior attempt forests stay (existing resumability constraint).
- Mid-stream token resume remains a non-goal.
- This lane does not hold the schema lock unless a later implementation brief says so.

## Handoff notes

Parent plan: `notes/execution-control-plan.md`. Integrator WC: tsk `tde88a16b`.

Reuse survey: `packages/core` workflow retry (`retry-attempt.ts`, `WorkflowStore.seedRetryAttempt`), observability events, `packages/tools` approval sketches, `notes/resumability.md`, `notes/future-extensions.md`, workflows guide Resumability section.
