## Goal

Add Playwright browser tests for the inspection UI agent chat that drive a mock-LLM fixture end-to-end: optimistic user bubble, generating indicator, streamed assistant text, and a tool-loop final reply without reload — wired into CI and the full gate.

## Principles

- Fail closed — no silent fallbacks
- Upstream before workaround
- Generalize; don't special-case
- One concern per change
- Plan first
- State what is not done

## Scope

1. **Fixture project** under `apps/web/e2e/fixture/` with `createAdlRuntime` and `MockLanguageModelV2` agents (no live API keys, no `@agent-dev-lab/tools` / bwrap): `echo-agent` (delayed multi-delta text) and `tool-loop-agent` (tool call then final `TOOL_LOOP_DONE`). No `titleWorkflow`.
2. **Playwright harness:** `@playwright/test`, Chromium only, `webServer` starting Vite with `ADL_PROJECT_ROOT` → fixture, temp `ADL_SQLITE_PATH`, `ADL_PROJECT_WATCH=0`. Scripts on `@agent-dev-lab/web`; extend root/`turbo` `test:e2e` to include web. CI installs Chromium and runs e2e after build; `.claude/gate.sh full` gains a `test:e2e` step (not `fast`).
3. **Minimal selectors:** `data-testid` on chat composer/send; use existing `aria-label="Generating"`.
4. **Specs:** (a) echo — optimistic user text, in-flight indicator and/or partial stream, settled assistant, still present after reload; (b) tool-loop — tool row then final assistant text **without** reload; (c) second echo turn — optimistic second user + reply (guards seed-effect transcript wipe).
5. **Docs:** AGENTS.md test note; mark Playwright row in `notes/near-term-roadmap.md`.

## Out of scope

- Graphical JSON editor (Lane A).
- Workflow waterfall / step-inspector streaming.
- Live OpenAI / playground agents.
- Multi-browser matrix / visual regression.
- Putting Playwright in `gate.sh fast`.
- Landing work in the reporter task `taba0001f`.

## Success criteria

1. `cd apps/web && bun run test:e2e` passes locally with no API key.
2. Tool-loop spec fails if the final assistant reply is missing until a full page reload.
3. CI runs Chromium Playwright for web after build; `.claude/gate.sh full` runs `test:e2e`.
4. Roadmap / AGENTS.md reconciled.

## Constraints

- Copy mock stream helpers into the fixture; do not import `*.test.ts` from core.
- Isolated sqlite per run — no shared `.data` with playground.
- Do not `--switch` the reporter off `taba0001f`.

## Handoff notes

Reporter lane: `taba0001f` (streaming fixes already in that stack). Sibling lane owns the JsonDocument-styled JSON editor.

Reuse survey (verify in checkout):

- `packages/core/src/agent/agent-impl.test.ts` — `toolCallStream` / `finalTextStream` / `MockLanguageModelV2`
- `apps/web/src/lib/adl-project.server.ts` — `ADL_PROJECT_ROOT`
- `apps/web/src/hooks/use-agent-run-events.ts` — SSE streaming / commit refresh
- `apps/web/src/components/app/agent-run-workspace.tsx` — chat send + message state
- `apps/web/src/components/app/chat-message-list.tsx` — `Generating` indicator
- `notes/near-term-roadmap.md` — Playwright CI gap row
- Root `package.json` / `turbo.json` — existing `test:e2e` (CLI only today)
