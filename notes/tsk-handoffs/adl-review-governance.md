# HANDOFF — adl-review-governance (wave 0)

## Goal

Turn recurring human review questions into durable models and CI/enforcement so later agent forks inherit them — MAGE-style governance conversion for ADL review capacity. See `notes/mage-governance.md`.

## Principles

- Fail closed; upstream before workaround; generalize; one concern; plan first; state gaps.
- Smallest useful model; alignment over prose; commodity layer only.

## Scope

1. Inventory recent review/Bugbot/house-rule bites → table: question / existing check / gap (`notes/mage-governance.md`).
2. Land only **cheap** alignments in this fork (examples: public-API changeset presence check if missing; package layer smoke; document fail-closed for tools if Lane E not merged).
3. Either **fix** the root-scoped session `workflowRunId` overwrite (`registerAgentSessionFromEpisode`) or open a dedicated follow-up HANDOFF — do not leave it silent.
4. Update `notes/near-term-roadmap.md` status for what became gated.
5. Do **not** implement EffectGate tools wiring, cursor retry, or debugger here.

## Out of scope

- Full MAGE skill-pack adoption.
- Effect-gate-at-tools / `seedRetryFromCursor` / suspend store (later forks).
- MCP, model catalog, `$` estimates product work.

## Success criteria

1. Written inventory in `notes/mage-governance.md` (or linked appendix) with ≥5 recurring questions mapped.
2. At least one new or tightened automated check for a property previously human-only — or an explicit deferral with reason.
3. Session/`workflowRunId` issue fixed or tracked with a named next fork.
4. `.claude/gate.sh full` green if code changed; `fast` if notes-only.

## Constraints

- Prefer extending existing gate/contract tests over new frameworks.
- No silent allow defaults.
- Provision with `tsk task fork`, not orch.

## Handoff notes

Parent: integrator after current stack lands. Next spine forks listed in `notes/execution-control-plan.md` § Next forks.
