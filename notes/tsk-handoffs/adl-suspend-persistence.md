# HANDOFF — adl-suspend-persistence

## Goal

Persist `EffectDecision.suspend` (and approval waits) so a run can resume after process restart — shared pause substrate for approvals and the future debugger.

## Principles

- Fail closed; one concern; plan first; state gaps.
- Align with SuspendStore sketch in `notes/execution-control-plan.md`.

## Scope

1. `SuspendStore` (or store methods) for pending suspend records keyed by run/attempt/intent.
2. Wire `EffectGate` suspend path + approval wait to persist and park the run.
3. Resume API: resolve decision → continue from cursor (not full re-run from step 0).
4. Inspection UI: show suspended/waiting state; resolve action.
5. Tests: kill process mid-wait → resume after reload (or equivalent store-level contract).
6. Changesets for core (+ web).

## Out of scope

- DAP / step debugger UI (next fork).
- Env CoW.
- Cursor retry (should already exist).

## Success criteria

1. Suspended run survives store reopen and resumes to completion in a test.
2. Approval and “debugger pause” share the same suspend record shape (or documented subtype).
3. No silent drop of suspend on process exit.
4. `.claude/gate.sh full` green.

## Constraints

- Prefer extending `WorkflowStore` / existing SQLite patterns over a second database.
- User-visible errors if resume target is missing — no ghost allow.

## Handoff notes

Depends on: `adl-effect-gate-tools` + preferably `adl-retry-from-cursor`. Next: `adl-debugger-l1`.
