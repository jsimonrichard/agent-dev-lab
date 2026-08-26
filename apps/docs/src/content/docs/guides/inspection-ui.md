---
title: Inspection UI
description: Run the inspector, start workflows, watch waterfalls, and chat with agents.
---

The inspection UI (`@agent-dev-lab/web`) is how you **start, watch, and replay** runs for an ADL project. It does not execute workflows itself: it calls `loadAdlProject()`, then `workflow.run` / `agent.run`, and tails persisted [`RunEvent`](/api/type-aliases/runevent/)s.

## Open the inspector

From a project with `adl.config.*`:

```bash
adl dashboard          # Vite in the monorepo; Nitro `--serve` for published installs
adl dashboard --project ../other-research
```

Framework development against `apps/playground`: `bun run dev:web` from the repo root (`ADL_FRAMEWORK_DEV=1`).

The header shows the project **name** and whether you are in framework-dev, project-dev, or serve mode.

| Mode              | How it starts                             | Hot reload                                        |
| ----------------- | ----------------------------------------- | ------------------------------------------------- |
| **framework-dev** | `bun run dev:web` (`ADL_FRAMEWORK_DEV=1`) | Yes — Vite dev server watches the project         |
| **project-dev**   | `adl dashboard` with a Vite dev tree      | Yes                                               |
| **serve**         | `adl dashboard --serve` or Nitro `start`  | No — `ADL_INSPECTOR_SERVE=1` disables the watcher |

Standalone CLI commands (`adl run`, `adl workflows list`, etc.) are separate processes: they load the project once and never watch for changes.

## Workflows

Registered ids come from `adl.config` `workflows`. The sidebar lists startable workflows and past runs (title from `ctx.setTitle` when set).

1. Open a workflow and start a run. If the workflow has a Zod `input` schema, the start dialog builds a form from it (defaults apply).
2. The run page is a **waterfall**: steps, nested steps, parallel keyed steps, and agent episodes.
3. Select a step or agent call for output, errors, and the conversation transcript for that `memoryScope`.
4. **Cancel** asks the in-process handle to abort. Cooperative cancellation is still incomplete in the runtime — in-flight `ctx.step` bodies and child `agent.run` calls may finish. See [Workflows — known limitations](/core/workflows/#known-limitations).

Live updates use **SSE** (`GET /api/runs/:runId/events?afterSeq=`). Reconnects replay from the last applied `seq`. History is always the SQLite (or in-memory) [`WorkflowStore`](/api/interfaces/workflowstore/), so you can reopen a finished run later.

Helpers that you **do not** put in `workflows: []` still persist if they `run()`, but they do not appear as startable targets or in the default run list. Conversation [`titleWorkflow`](/core/agents/#conversation-titles) uses `{ isolated: true }` so naming a chat does not inject steps into another workflow's tree.

## Agents

Registered `agents` can be opened as **conversations** (standalone `memoryScope`s), not only as nodes inside a workflow.

- New chat → `agent.run` / stream; first successful episode may set a title via `titleWorkflow`.
- **Fork** from a workflow agent episode copies that transcript into a new conversation you can continue.
- Shared scopes show history **up to** the selected episode; later turns are muted so you can see what the model had at that call.
- The agent settings panel reports effective **model** (id + provider when the LanguageModel exposes them), **memory** backend kind (`sqlite` / `in-memory` / custom), tools, and title workflow id.

## What is not in the inspector yet

- A template playground (edit/render `createTemplate` markdown in the UI)
- A dedicated raw token-debug pane (assistant text already streams via `agent_text_delta` in chat/run views)

Those stay deferred; see the repo `notes/v1-scope.md` for RC tracking.
