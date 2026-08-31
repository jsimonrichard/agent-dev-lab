---
title: Overview
description: High-level orientation for the Agent Dev Lab docs site.
---

**Agent Dev Lab** is a TypeScript-first toolkit for authoring AI agents and workflows: a headless core (`@agent-dev-lab/core`), an inspection UI (`@agent-dev-lab/web`), and a CLI (`adl`).

## What you get

- **Agents and workflows as plain TypeScript** on top of the [Vercel AI SDK](https://ai-sdk.dev/) (`streamText`, `tool`, `ModelMessage`)
- **Persisted run events** for waterfalls, SSE tails, and replay (`WorkflowStore` / SQLite)
- **`adl init` / `adl workflow run` / `adl agent run` / `adl dashboard`** for scaffolding, CLI execution, and inspection
- **Published `adl dashboard` is a Nitro serve** — restart after registry or `.env*` edits

## Principles

- **Runtime/UI split** — workflows run from scripts, tests, or server; UI reads persisted output.
- **TypeScript-first** — plain TS orchestration, no workflow graph DSL.
- **AI SDK native** — `ModelMessage`, `streamText`, `tool()` without parallel abstractions.
- **Colocated prompts** — markdown beside code; templates via Handlebars + Zod (`createTemplate`).

## Documentation map

### Guides

- [Project Setup](/guides/project-setup/) — the recommended way to start a project (`adl init`)
- [Manual Setup](/guides/manual-setup/) — adding ADL to an existing project by hand
- [Inspection UI](/guides/inspection-ui/) — `adl dashboard`, waterfalls, agent conversations, event log
- [Gotchas](/guides/gotchas/) — sharp edges worth knowing about before they surprise you
- [Runtime](/core/runtime/) — `createAdlRuntime`, workflow context, OpenTelemetry
- [Agents](/core/agents/) — `adl.createAgent`, [`stopWhen`](https://ai-sdk.dev/docs/agents/loop-control), memory, `adl agent run`
- [Workflows](/core/workflows/) — `adl.createWorkflow`, `ctx.emit`, `createWorkflowFromAgent`
- [Project Config](/core/project/) — registry, `loadAdlProject`

### API reference

Generated from `@agent-dev-lab/core`'s own code comments — covers focused APIs that aren't duplicated as guide pages:

- [Package Overview](/api/readme/) — AI SDK compatibility summary (`ModelMessage`, OpenTelemetry)
- [MessageStore](/api/interfaces/messagestore/), [WorkflowStore](/api/interfaces/workflowstore/), [RunEvent](/api/type-aliases/runevent/) (`runSeq`)
- [Template](/api/interfaces/template/), [createTemplate](/api/functions/createtemplate/)
- [createWorkflowFromAgent](/api/functions/createworkflowfromagent/), [createToolFromAgent](/api/functions/createtoolfromagent/)
- [WorkflowObserver](/api/interfaces/workflowobserver/), [AgentObserver](/api/interfaces/agentobserver/)

Use the **Core API** sidebar for the full export list.

## Packages

| Package               | Role             |
| --------------------- | ---------------- |
| `@agent-dev-lab/core` | Headless runtime |
| `@agent-dev-lab/web`  | Inspection UI    |
| `@agent-dev-lab/cli`  | `adl` CLI        |
