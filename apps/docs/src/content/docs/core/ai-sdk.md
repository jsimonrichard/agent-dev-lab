---
title: AI SDK compatibility
description: How @agent-dev-lab/core aligns with the Vercel AI SDK.
---

ADL stays aligned with the [Vercel AI SDK](https://ai-sdk.dev/) (`ai` package, **v5** in this repo). Prefer **re-export** over wrapping so user code matches upstream docs.

**Pinned:** `ai@^5` in `@agent-dev-lab/core` — re-verify when upgrading majors.

## Re-exports

| Item                                                        | Status                                              |
| ----------------------------------------------------------- | --------------------------------------------------- |
| `generateText`, `streamText`, `tool`                        | Exported                                            |
| `stepCountIs` and other stop helpers                        | Not re-exported — import from `ai` in workflow code |
| `CoreMessage`, `LanguageModel`, `ToolSet`                   | Exported as types                                   |
| `GenerateTextResult`, `StreamTextResult`, `ToolCallOptions` | Import from `ai` when needed                        |

## Message model

| Item                                                            | Status |
| --------------------------------------------------------------- | ------ |
| Persist `CoreMessage` only — no parallel ADL message type       | Done   |
| Tool calls as assistant parts; results as `role: "tool"`        | Done   |
| Commit `response.messages` to `MessageStore` after each episode | Done   |

## Agent execution

| Item                                                                      | Status |
| ------------------------------------------------------------------------- | ------ |
| Single internal path: `streamText` for `run` and `stream`                 | Done   |
| Structured output via `experimental_output` when schema set               | Done   |
| Forward `experimental_context` from `run({ context })` to tools           | Done   |
| One SDK step per `agent.run` (`stopWhen: stepCountIs(1)`)                 | Done   |
| ADL `createAgent` wraps SDK — does not require experimental `Agent` class | Done   |

## Tools

| Item                                                                  | Status                                |
| --------------------------------------------------------------------- | ------------------------------------- |
| Standard AI SDK `tool({ inputSchema, execute })`                      | Done                                  |
| `execute` receives `ToolCallOptions` including `experimental_context` | Done                                  |
| `contextSchema` on tools                                              | Future — when SDK version supports it |

## Streaming

| Item                                           | Status |
| ---------------------------------------------- | ------ |
| `onChunk` → `agent_text_delta` run events      | Done   |
| `run` and `stream` share persistence on finish | Done   |
| `abortSignal` forwarded to `streamText`        | Done   |

## What ADL adds (not in AI SDK)

| Item                                                           | Status |
| -------------------------------------------------------------- | ------ |
| `createAgent`, `createWorkflow`, `memoryScope`, `MessageStore` | Done   |
| `WorkflowContext.step`, observers, `WorkflowStore`             | Done   |
| `createTemplate` + Zod                                         | Done   |

These compose with SDK types — they do not fork them.

## Non-goals (v1)

- Built-in evals / scorers
- AI SDK `Experimental_Agent` / `@ai-sdk/workflow` as required path
- `UIMessage` types in headless core — convert in `apps/web` if needed
- Provider-specific APIs in core (users configure `LanguageModel` in project code)

## Upgrade process

When bumping `ai` major:

1. Run this checklist against release notes.
2. Update agent runner and re-exports.
3. Re-run `packages/core` tests + playground smoke.
4. Note breaking changes in changelog.
