---
title: Overview
description: High-level orientation for the Agent Dev Lab docs site.
---

The **Agent Dev Lab** is a TypeScript-first workspace for experimenting with agentic workflows: a headless core library (`@agent-dev-lab/core`), a TanStack Start inspection UI (`apps/web`), CLI (`adl`), and shared infrastructure.

## What is implemented today

The **headless runtime** in `@agent-dev-lab/core` is usable without the UI or CLI execution path:

| Area                                                                      | Status      |
| ------------------------------------------------------------------------- | ----------- |
| `createAdlRuntime`, agents, workflows, templates                          | Implemented |
| `agent.run` / `agent.stream` via AI SDK `streamText`                      | Implemented |
| `workflow.run` / `workflow.stream`, `ctx.step`, nesting, isolated runs    | Implemented |
| Conversation titles (`titleWorkflow`, `ctx.setTitle`)                     | Implemented |
| `MessageStore` + `WorkflowStore` (in-memory + SQLite)                     | Implemented |
| Observers, `RunRecorder`, run events, OTel spans at run/step/agent bounds | Implemented |
| `EventLog` / `inMemoryEventLog` process-wide observer                     | Implemented |
| `loadAdlProject` + registry indexes + `.env*` loading                     | Implemented |
| Project hot reload (`reload`, `watchAdlProject`) in dev                   | Implemented |
| `adl.createToolFromAgent` / `adl.createToolFromWorkflow`                  | Implemented |
| CLI `adl run` / list / `adl dashboard`                                    | Implemented |
| CLI `adl init`                                                            | Scaffold    |
| Inspection UI: waterfall, SSE, cancel, agent chats, fork, event log       | Implemented |
| Playground multi-agent samples                                            | Implemented |

## Documentation map

### Guides (Starlight)

Cross-cutting concepts and project layout:

- [Project setup](/guides/project-setup/) — required vs recommended layout; `#adl` import alias; how tooling gets `config.adl`
- [Inspection UI](/guides/inspection-ui/) — `adl dashboard`, waterfalls, agent conversations, event log
- [Runtime](/core/runtime/) — `adl` runtime, ALS for workflow context
- [Agents](/core/agents/) — `adl.createAgent`, memory, structured output, conversation titles
- [Workflows](/core/workflows/) — `adl.createWorkflow`, steps, keys, nesting, isolated runs
- [Project config](/core/project/) — registry, `loadAdlProject`

### API reference (TypeDoc)

Generated from `packages/core` — includes JSDoc for focused APIs that are not duplicated as Starlight pages:

- [Package overview](/api/readme/) — AI SDK compatibility summary
- [MessageStore](/api/interfaces/messagestore/), [WorkflowStore](/api/interfaces/workflowstore/), [RunEvent](/api/type-aliases/runevent/)
- [Template](/api/interfaces/template/), [createTemplate](/api/functions/createtemplate/)
- [WorkflowObserver](/api/interfaces/workflowobserver/), [AgentObserver](/api/interfaces/agentobserver/)

Use the **Core API** sidebar for the full export list.

## Principles

- **Runtime/UI split** — workflows run from scripts, tests, or server; UI reads persisted output.
- **TypeScript-first** — plain TS orchestration, no workflow graph DSL.
- **AI SDK native** — `CoreMessage`, `streamText`, `tool()` without parallel abstractions.
- **Colocated prompts** — markdown beside code; templates via `createTemplate`.
- **Docs near code** — smaller single-API surfaces documented in JSDoc; conceptual guides stay in Starlight.

## Monorepo packages

| Package                 | Role                                      |
| ----------------------- | ----------------------------------------- |
| `@agent-dev-lab/core`   | Headless runtime                          |
| `@agent-dev-lab/web`    | Inspection UI (port 3000)                 |
| `@agent-dev-lab/cli`    | `adl` CLI                                 |
| `@agent-dev-lab/docs`   | This site (port 4321)                     |
| `@agent-dev-lab/common` | Drizzle + SQLite helpers, logging, ESLint |
| `apps/playground`       | Framework dev project                     |

## Development

From the repo root:

```bash
bun install
bun run dev:docs   # this site on :4321
bun run dev:web    # inspection UI on :3000
```

Coding-agent tracking notes (RC remaining work, deferred design) live in the repo `notes/` directory.
