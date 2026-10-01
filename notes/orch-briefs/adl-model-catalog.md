## Goal

Add a UI-only model catalog in `adl.config` and an inspector model picker that constructs a live `LanguageModel` via factory — building on the per-call override from Lane C — without teaching core to resolve models from strings.

## Principles

- Fail closed — no silent fallbacks
- Upstream before workaround
- Generalize; don't special-case
- One concern per change
- Plan first
- State what is not done

## Scope

1. **Depends on Lane C** (per-call `model` + episode descriptors). If C is not merged, stop and report.
2. Catalog shape e.g. `models: [{ id, label, provider, factory }]` in project config — consumed only by `apps/web` / CLI hosts.
3. Inspector picker write path: composer / agent settings send the chosen factory result into the run input (not a persisted pin).
4. Optional provider-key preflight before run (flag missing key in UI/CLI).
5. Changesets for touched packages.

## Out of scope

- Core resolution from `{ modelId, provider }` strings.
- Conversation-pinned model across turns (explicitly deferred in roadmap §1).
- Execution-control / approval lanes.

## Success criteria

1. User can pick a catalog model in the inspector and the next run uses that live model.
2. Core still only sees `LanguageModel`; catalog stays host-side.
3. `.claude/gate.sh full` green.

## Constraints

- No `agent.setModel()` mutability.
- Fail closed if factory missing for a selected id — do not invent a default model silently.

## Handoff notes

Parent plan lane map G. Requires Lane C. Roadmap §1 remaining rows.
