# AI SDK compatibility checklist

How ADL stays aligned with the [Vercel AI SDK](https://ai-sdk.dev/) (`ai` package, currently **v5** in this repo). Implementation should satisfy these items; use as review checklist before releases.

Related: [`agent-api.md`](./agent-api.md), [`streaming-api.md`](./streaming-api.md).

**Pinned dependency:** `ai@^5` in `@agent-dev-lab/core` — re-verify when upgrading majors.

---

## Re-exports (surface)

- [ ] `generateText`, `streamText` from `ai`
- [ ] `tool`, `stepCountIs` (and other stop helpers workflows may use)
- [ ] `CoreMessage` / `ModelMessage`, `LanguageMessage`, `LanguageModel`
- [ ] Types: `GenerateTextResult`, `StreamTextResult`, `ToolSet`, `ToolCallOptions` as needed

Prefer **re-export** over wrapping so user code matches upstream docs.

---

## Message model

- [ ] Persist and pass **`ModelMessage` / `CoreMessage`** only — no parallel ADL message type
- [ ] Tool calls as **assistant** parts (`tool-call`); results as **`role: "tool"`** messages
- [ ] After each agent episode, commit **`result.response.messages`** (not `toolCalls` alone) to [`MessageStore`](./message-store.md)

---

## Agent execution

- [ ] **Single internal path:** `streamText` for both `agent.run` (drain) and `agent.stream` (expose streams) — [`streaming-api.md`](./streaming-api.md)
- [ ] **Structured output:** `streamText` / `generateText` with `output` schema when `createAgent({ output })` or `run({ output })` — still stream reasoning/text parts when provider emits them
- [ ] Forward **`experimental_context`** from `agent.run({ context })` to `streamText` → tool `execute` `options.experimental_context`
- [ ] Default **one SDK step** per `agent.run` (`stopWhen: stepCountIs(1)` or equivalent); multi-step tool loops live in **workflow** TypeScript
- [ ] Do **not** require AI SDK experimental **`Agent`** class for v1 — ADL **`createAgent`** wraps `streamText` / `generateText` directly

---

## Tools

- [ ] Agent tools are standard AI SDK **`tool({ inputSchema, execute })`** (Zod schemas)
- [ ] Tool `execute` receives SDK **`ToolCallOptions`** (`toolCallId`, `messages`, `abortSignal`, `experimental_context`)
- [ ] Optional future: adopt **`contextSchema`** on tools when our `ai` version supports typed context

---

## Streaming

- [ ] `onChunk` / stream parts → observers + run events (`text_delta`) when configured
- [ ] `onFinish` / awaited completion → persistence parity between `run` and `stream`
- [ ] Forward **`abortSignal`** to `streamText`

---

## What ADL adds (not in AI SDK)

- [ ] `createAgent`, `createWorkflow`, `memoryScope`, [`MessageStore`](./message-store.md)
- [ ] `WorkflowContext.step`, observers, [`WorkflowStore`](./observability-api.md)
- [ ] `createTemplate` + Zod — [`templates-api.md`](./templates-api.md)

These must **compose** with SDK types, not fork them.

---

## Upgrade process

When bumping `ai` major:

1. Run this checklist against release notes.
2. Update `executeAgentEpisode` and re-exports.
3. Re-run runtime tests + playground smoke.
4. Note breaking changes in ADL changelog.

---

## Non-goals (v1)

- [ ] Built-in **evals / scorers**
- [ ] AI SDK **`Experimental_Agent`** / `@ai-sdk/workflow` durable agents as required path
- [ ] UI message types (`UIMessage`) in headless runtime — convert only in `apps/web` if needed
- [ ] Provider-specific APIs in core runtime (users configure `LanguageModel` in project code)
