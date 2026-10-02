# HANDOFF — adl-retry-from-cursor

## Goal

Make attempt re-entry addressable by `TraceCursor` (effect intent id primary; step id as UI alias). Keep `seedRetryAttempt({ fromStepId })` as a compatibility wrapper. Immutable prior forests stay.

## Principles

- Fail closed; one concern; plan first; state gaps.
- Obey `notes/execution-control-plan.md` and effect-boundary obligations from `notes/mage-governance.md`.

## Scope

1. Implement `seedRetryFromCursor` (name may match plan sketch) on `WorkflowStore` / retry path.
2. Wrapper: `fromStepId` → cursor at step-boundary intent (or documented equivalent if intents not yet emitted for steps).
3. Inspector Retry keeps step UX; optional effect-id is follow-up unless cheap.
4. Tests: forest immutability; skip/replay semantics documented vs today’s step skip.
5. Changeset for `@agent-dev-lab/core` (+ web if UI touched).

## Out of scope

- Full effect intent emission for model calls (may land with effect-gate-tools).
- SuspendStore / debugger.
- Env CoW / file revert on skip.

## Success criteria

1. A test seeds an attempt from a cursor and runs successfully under the documented skip rules.
2. Old `seedRetryAttempt({ fromStepId })` still works via wrapper.
3. Prior attempt forest rows are not mutated.
4. `.claude/gate.sh full` green.

## Constraints

- Do not grow more step-only special cases that ignore cursors.
- Prefer AI SDK / existing store projection patterns.

## Handoff notes

Depends on: `adl-effect-gate-tools` (or sufficient intent ids existing). Next: `adl-suspend-persistence`.
