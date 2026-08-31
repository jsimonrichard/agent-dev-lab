---
title: Inspection UI
description: Run the inspector, start workflows, watch waterfalls, and chat with agents.
---

The inspection UI (`@agent-dev-lab/web`) is how you **start, watch, and replay** runs for an ADL project. It does not execute workflows itself: it calls `loadAdlProject()`, then `workflow.run` / `agent.run`, and tails persisted [`RunEvent`](/api/type-aliases/runevent/)s.

## Open the inspector

From a project with `adl.config.*`:

```bash
adl dashboard
adl dashboard --serve
adl dashboard --project ../other-research
```

The header shows the project **name**. There is **no hot reload** — restart `adl dashboard` after changing registry modules or `.env*` files. `--serve` runs the Nitro build shipped in `@agent-dev-lab/web`. `--project` points at another directory that contains `adl.config.*`.

Standalone CLI commands (`adl workflow run`, `adl agent run`, `adl workflow list`, etc.) are separate processes: they load the project once and exit.

## Workflows

Registered ids come from `adl.config` `workflows`. The sidebar lists startable workflows and past runs (title from `ctx.setTitle` when set).

1. Open a workflow and start a run. If the workflow has a Zod `input` schema, the start dialog builds a form from it (defaults apply).
2. The run page is a **waterfall**: steps, nested steps, parallel keyed steps, and agent episodes.
3. Select a step or agent call for output, errors, and the conversation transcript for that `memoryScope`.
4. **Cancel** calls `handle.cancel()`, which aborts `ctx.signal`, in-flight `ctx.step` bodies, and child `agent.run` / `streamText` calls on that run. Isolated helper runs (for example conversation `titleWorkflow`) are not cancelled with the parent.

Live updates use **SSE** (`GET /api/runs/:runId/events?afterSeq=`). Reconnects replay from the last applied `runSeq`. History is always the SQLite (or in-memory) [`WorkflowStore`](/api/interfaces/workflowstore/), so you can reopen a finished run later.

Helpers that you **do not** put in `workflows: []` still persist if they `run()`, but they do not appear as startable targets or in the default run list. Conversation [`titleWorkflow`](/core/agents/#conversation-titles) uses `{ isolated: true }` so naming a chat does not inject steps into another workflow's tree.

## Agents

Registered `agents` can be opened as **conversations** (standalone `memoryScope`s), not only as nodes inside a workflow.

- New chat → `agent.run()` (AI SDK `stopWhen`, default `stepCountIs(20)`); first successful turn may set a title via `titleWorkflow`. Tool call/result events still fire while the model works.
- **Fork** from a workflow agent episode copies that transcript into a new conversation you can continue.
- Shared scopes show history **up to** the selected episode; later turns are muted so you can see what the model had at that call.
- The agent settings panel reports effective **model** (id + provider when the LanguageModel exposes them), **memory** backend kind (`sqlite` / `in-memory` / custom), tools, `stopWhen` (`default` / `custom`), and title workflow id.

## Event log

The **Event log** page (`/events`) is a process-wide tail of every `RunEvent` the inspector has seen — workflow runs and standalone agent conversations — not one run at a time.

- Open it from the home sidebar or the rail. The context sidebar is hidden so the table can use the full width.
- Live updates use **SSE** (`GET /api/events?afterSeq=`). The stream id is the process `logSeq`, not per-run `runSeq`. Reconnects replay from the last applied `logSeq`.
- On inspector start, an empty in-memory buffer is **hydrated** from the last 100 persisted workflow runs and standalone agent episodes in [`WorkflowStore`](/api/interfaces/workflowstore/). **Clear** empties the in-memory view only; persisted runs stay. Restart hydrates again.
- Default filters hide `agent_text_delta`. Add field clauses (equals / not-equals / contains on strings / exists / empty). Click a name to open that run, conversation, call, or step — conversations highlight the matching transcript slice (`?call=`). Right-click a value to filter; ⋯ opens the full JSON payload.
- The footer paginates the filtered list (oldest page first; page 1 is the live tail when you stay on it).

The log is a ring buffer (default 10_000 events). It is not a durable store of its own — durability is still `WorkflowStore`.

## What is not in the inspector yet

- A template playground (edit/render `createTemplate` markdown in the UI)
- A dedicated raw token-debug pane (assistant text already streams via `agent_text_delta` in chat/run views)
- Manual runs of `adl.config.tools` (registry-only today; runtime merge is `createAdlRuntime({ tools })`)
