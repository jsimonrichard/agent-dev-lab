## Goal

Add a per-call `AgentRunInput.model` override resolved as `input.model ?? definition.model ?? defaults.model`, and record `{ modelId, provider }` on `agent_started` / episode projections so switches are observable — without inventing a persisted factory or mutable `agent.setModel()`.

## Principles

- Fail closed — no silent fallbacks
- Upstream before workaround
- Generalize; don't special-case
- One concern per change
- Plan first
- State what is not done

## Scope

1. Follow decided rules in [`notes/near-term-roadmap.md`](../near-term-roadmap.md) §1 (do not reopen conversation-pinned model or catalog-in-core).
2. Thread live `LanguageModel` override through `AgentImpl` resolution.
3. Use existing `inspectLanguageModel` (or equivalent) to emit `{ modelId, provider }` on start and persist on `adl_agent_episodes`.
4. Tests proving override wins and descriptors are non-empty when a model is present.
5. Changeset for `@agent-dev-lab/core`.

## Out of scope

- Model catalog in `adl.config` and inspector picker (Lane G).
- Provider-key preflight UI.
- `prepareStep` per-step model switching demos (allowed later via AI SDK once override exists).
- Lane A execution-control work.

## Success criteria

1. `agent.run({ model, … })` uses that model for the episode.
2. Episode / `agent_started` carry inspectable `modelId` + `provider` strings (not a reconstituted factory).
3. `.claude/gate.sh full` green.

## Constraints

- Live `LanguageModel` only — nothing persisted for later reconstruction.
- No `agent.setModel()` / mutable per-instance model.
- Core never consults a UI catalog.

## Handoff notes

Parent plan lane map C. Roadmap §1.

Reuse: `AgentImpl`, `inspectLanguageModel`, episode projections, inspector Model section (read-only today — leave write path to G).
