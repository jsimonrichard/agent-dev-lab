# HANDOFF — adl-effect-gate-tools

## Goal

Wire `@agent-dev-lab/tools` (and call sites) so tool materialization goes through a required `EffectGate`: intent → decision → execute/deny/rewrite. Approval is an `EffectHandler` adapter. Suspend returns are explicit errors until SuspendStore exists.

## Principles

- Fail closed; no omit→allow; generalize; one concern; plan first; state gaps.
- Obey `notes/execution-control-plan.md` decided items 1–4, 6 and `notes/mage-governance.md` effect/ownership obligations.

## Scope

1. Required `EffectGate` (or project-supplied compose) on tool factories/providers that side-effect.
2. `assertToolAllowed` (or successor) before execute; tests prove deny prevents side effects.
3. `ApprovalDispatcher` → `EffectHandler`; sticky allow policy as designed in Lane E if merging that work.
4. Playground/fixtures pass explicit `allowAllGate` where needed.
5. Changeset for `@agent-dev-lab/tools` (and core if API surface changes).
6. Do **not** implement `seedRetryFromCursor` or SuspendStore persistence here — leave hooks/errors for the next forks.

## Out of scope

- Cursor-based retry migration.
- Debugger UI / DAP.
- Env CoW.
- Full `ctx.requestApproval` persistence (needs suspend fork).

## Success criteria

1. A denying gate prevents file/bash (and covered tools) side effects in tests.
2. Missing gate fails closed (throw / typed error), not warn-and-allow.
3. Suspend decision fails with a clear “not wired” error (or equivalent), not silent allow.
4. `.claude/gate.sh full` green.

## Constraints

- Prefer merging/finishing `t2d60c763` work over rewriting a parallel approval stack.
- Hosts never branch on tool plugin identity for gating.

## Handoff notes

Depends on: current stack + wave 0 governance inventory. Next: `adl-retry-from-cursor`.
