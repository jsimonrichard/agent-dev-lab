---
title: Overview
description: High-level orientation for the Agent Dev Lab docs site.
---

**Agent Dev Lab** is a TypeScript-first toolkit for authoring AI agents and workflows: a headless core (`@agent-dev-lab/core`), an inspection UI (`@agent-dev-lab/web`), and a CLI (`adl`). SQLite helpers, ESLint, and tsconfig live as exports on core (`./db`, `./eslint`, `./tsconfig/node.json`).

## What you get

- **Agents and workflows as plain TypeScript** on top of the [Vercel AI SDK](https://ai-sdk.dev/) (`streamText`, `tool`, `ModelMessage`)
- **Persisted run events** for waterfalls, SSE tails, and replay (`WorkflowStore` / SQLite)
- **`adl init` / `adl workflow run` / `adl agent run` / `adl dashboard`** for scaffolding, CLI execution, and inspection
- **Published `adl dashboard` is a Nitro serve** — restart after registry or `.env*` edits

## Documentation map

### Guides (Starlight)

- [Project setup](/guides/project-setup/) — layout, `#adl` alias, env, common pitfalls
- [Inspection UI](/guides/inspection-ui/) — `adl dashboard`, waterfalls, agent conversations, event log
- [Runtime](/core/runtime/) — `createAdlRuntime`, workflow context, OpenTelemetry
- [Agents](/core/agents/) — `adl.createAgent`, `stopWhen`, memory, `adl agent run`
- [Workflows](/core/workflows/) — `adl.createWorkflow`, `ctx.emit`, `createWorkflowFromAgent`
- [Project config](/core/project/) — registry, `loadAdlProject`

### API reference (TypeDoc)

Generated from `@agent-dev-lab/core` JSDoc — includes focused APIs that are not duplicated as Starlight pages:

- [Package overview](/api/readme/) — AI SDK compatibility summary (`ModelMessage`, OpenTelemetry)
- [MessageStore](/api/interfaces/messagestore/), [WorkflowStore](/api/interfaces/workflowstore/), [RunEvent](/api/type-aliases/runevent/) (`runSeq`)
- [Template](/api/interfaces/template/), [createTemplate](/api/functions/createtemplate/)
- [createWorkflowFromAgent](/api/functions/createworkflowfromagent/), [createToolFromAgent](/api/functions/createtoolfromagent/)
- [WorkflowObserver](/api/interfaces/workflowobserver/), [AgentObserver](/api/interfaces/agentobserver/)

Use the **Core API** sidebar for the full export list.

## Principles

- **Runtime/UI split** — workflows run from scripts, tests, or server; UI reads persisted output.
- **TypeScript-first** — plain TS orchestration, no workflow graph DSL.
- **AI SDK native** — `ModelMessage`, `streamText`, `tool()` without parallel abstractions.
- **Colocated prompts** — markdown beside code; templates via Handlebars + Zod (`createTemplate`).

## Packages

| Package               | Role                                                     |
| --------------------- | -------------------------------------------------------- |
| `@agent-dev-lab/core` | Headless runtime (also `./db`, `./eslint`, `./tsconfig`) |
| `@agent-dev-lab/web`  | Inspection UI                                            |
| `@agent-dev-lab/cli`  | `adl` CLI                                                |
