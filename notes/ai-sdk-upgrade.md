# AI SDK upgrade (`ai` 5 → 7)

**Status:** Landed (2026-10-02) — AI SDK **v7**, `ai` / `@ai-sdk/otel` as core peers; `.claude/gate.sh full` green.
**Upstream:** [Migrate 5→6](https://ai-sdk.dev/docs/migration-guides/migration-guide-6-0), [Migrate 6→7](https://ai-sdk.dev/docs/migration-guides/migration-guide-7-0).

---

## What shipped

- `@agent-dev-lab/core`: `ai@^7` and `@ai-sdk/otel@^1` are **peerDependencies** (+ matching `devDependencies`); removed from `dependencies`.
- Hosts (playground, CLI scaffold, `apps/web`) declare `ai`, `@ai-sdk/otel`, and v7-aligned `@ai-sdk/openai@^4`.
- `@agent-dev-lab/tools`: `@ai-sdk/mcp@^2`.
- Hotspots: dropped `CoreMessage` re-export; `system`→`instructions`; `experimental_telemetry`→`telemetry` + `registerTelemetry(OpenTelemetry)` in `createAdlRuntime`; `experimental_output`→`output`; mocks `MockLanguageModelV4`; `toTokenUsage` maps AI SDK 7 nested cache/reasoning fields into flat ADL `TokenUsage`.
- Codemods run (`@ai-sdk/codemod` v6 then v7); several false positives reverted (ADL `TokenUsage` fields, `stepCountIs` public name, `fullStream`).
- Mock streams: LanguageModelV4 `finishReason` is `{ unified: "stop" | "tool-calls" | … }` (not a bare string); provider usage is nested `inputTokens.total` / etc. AI SDK 7 defaults `streamText`/`generateText` `stopWhen` to `stepCountIs(1)` — ADL agents still default to `stepCountIs(20)`.
- `step.response.messages` is **per-step** in v7 (not cumulative). AgentImpl appends each step’s messages; replacing with the latest step alone drops tool rows from the inspection UI. Prefer `result.responseMessages` for the full response history off a finished `streamText` result.

## Residual / follow-ups

- Hosts that already call `registerTelemetry` themselves will get ADL’s registration on first `createAdlRuntime` as well (process flag avoids only ADL double-register). Prefer one registration site if that fights a custom integration — open a follow-up if needed.
- Tool-level AI SDK `toolsContext` / per-tool `contextSchema` is unused; ADL still closes over `toolProviderContext` when building tools.
