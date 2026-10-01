## Goal

Extend Playwright coverage for the inspection UI gaps left after the 0.0.6 retry/fresh-project suites: copied waterfall bar layout, nested expand spinner behavior, and deeper start-workflow JSON editor paths.

## Principles

- Fail closed — no silent fallbacks
- Upstream before workaround
- Generalize; don't special-case
- One concern per change
- Plan first
- State what is not done

## Scope

1. Add or extend specs under `apps/web/e2e` (fixture and/or fresh-project) for:
   - Copied-bar layout after retry seed
   - Nested run expand / spinner
   - Start-workflow JSON editor (document + raw; invalid raw fails closed)
2. Reuse existing harnesses (`retry-attempt.spec.ts`, fresh-project pack) — do not stand up a third parallel stack.
3. Keep specs deterministic (mock LLM / fixture project); no API-key playground dependency.
4. Changeset only if product code must change to make assertions possible; prefer testing current behavior.

## Out of scope

- Implementing missing product features from Lane I (if a gap blocks the test, file it and assert what exists — or coordinate).
- INP bench (`ADL_INP_BENCH`).
- CLI init-smoke duplication.

## Success criteria

1. CI `test:e2e` covers the three named gaps (or documents an irreducible flake with Rule 6 — do not silently skip).
2. `.claude/gate.sh full` green.

## Constraints

- Chromium via Playwright as today; first-time browsers already documented in AGENTS.md.
- Do not require live provider keys.

## Handoff notes

Parent plan lane map J. Roadmap Playwright row; `notes/human-validation.md` lists current coverage.
