# HANDOFF — adl-debugger-l1

## Goal

First-party step debugger: pause at effect/step boundaries, inspect state, continue/step — built on SuspendStore + TraceCursor, not a parallel pause stack.

## Principles

- Fail closed; one concern; plan first; state gaps.
- Prefer DAP-shaped adapter later; L1 is inspection UI + core hooks.

## Scope

1. Breakpoints / pause-on-next-effect (or step boundary) using suspend.
2. Inspector: paused view, locals/state projection already available, continue / step-over.
3. Optional thin DAP adapter **only if** cheap; otherwise document mapping for a follow-up.
4. Tests for pause → inspect → continue.
5. Changesets.

## Out of scope

- Full IDE DAP productization.
- Time-travel / env CoW.
- Editing tool args mid-flight (rewrite path may exist from EffectGate — UI optional).

## Success criteria

1. User can pause a playground/fixture run and continue from the UI.
2. Pause uses the same suspend substrate as approvals.
3. `.claude/gate.sh full` green.

## Constraints

- No host branching on “debugger plugin id” — capability is on store/observer interfaces.
- Do not invent a second pause channel.

## Handoff notes

Depends on: `adl-suspend-persistence`. Parallel later: env CoW, DAP polish.
