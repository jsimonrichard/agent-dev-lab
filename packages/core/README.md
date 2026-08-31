<img src="https://raw.githubusercontent.com/jsimonrichard/agent-dev-lab/main/assets/brand/logo.svg" alt="" width="40" height="40" align="left" />

# `@agent-dev-lab/core`

Headless runtime for [Agent Dev Lab](https://agent-dev-lab.com) (ADL) — author agents and workflows as plain TypeScript on top of [Vercel's AI SDK](https://ai-sdk.dev/), with persisted run history for the optional [`@agent-dev-lab/web`](https://www.npmjs.com/package/@agent-dev-lab/web) inspection UI.

This package has no UI and no CLI dependency — it runs from scripts, tests, or a server. `@agent-dev-lab/cli` and `@agent-dev-lab/web` are optional additions for scaffolding and inspecting runs.

## Install

```bash
bun add @agent-dev-lab/core @ai-sdk/openai
# or: npm install @agent-dev-lab/core @ai-sdk/openai
```

`ai` (the Vercel AI SDK) and `zod` are dependencies of this package — `ModelMessage`, `streamText`, `tool`, and `stepCountIs` are re-exported from `@agent-dev-lab/core` so you don't need to depend on `ai` directly. You do need a model provider package such as `@ai-sdk/openai`.

## Quick start

```ts
import { createAdlRuntime, sqliteMessageStore, sqliteWorkflowStore } from "@agent-dev-lab/core";
import { openai } from "@ai-sdk/openai";

export const adl = createAdlRuntime({
  defaults: { model: openai("gpt-4o-mini") },
  stores: {
    message: sqliteMessageStore(),
    workflow: sqliteWorkflowStore(),
  },
});

const researcher = adl.createAgent({
  id: "researcher",
  model: openai("gpt-4o"),
  systemPrompt: "You are a research assistant.",
});

const review = adl.createWorkflow({
  id: "literature-review",
  run: async (input: { topic: string }, ctx) => {
    await ctx.step("research", async ({ ctx: child }) => {
      await researcher.run({
        memoryScope: child.memoryScopeWithSuffix("notes"),
        user: input.topic,
      }).result;
    });
    return { topic: input.topic };
  },
});

const handle = review.run({ topic: "CRISPR delivery" });
await handle.result;
```

`adl.createAgent` / `adl.createWorkflow` bind the runtime you built with `createAdlRuntime` — stores, observers, and default model/tools are wired in automatically. For unit tests, `createTestRuntime()` gives you the same shape backed by in-memory stores.

## What's in this package

| Area | Exports | Role |
| --- | --- | --- |
| **Runtime** | `createAdlRuntime`, `createTestRuntime` | Wires stores, observers, template engine, and default model/tools; `adl.createAgent` / `adl.createWorkflow` bind to it |
| **Agents** | `createAgent`, `stopWhen` re-exports (`stepCountIs`, `hasToolCall`), `inspectLanguageModel`, `inspectSystemPrompt` | Model + system prompt + tools + memory binding; `agent.run` / `agent.stream` are one conversation episode each |
| **Workflows** | `createWorkflow`, `createWorkflowFromAgent` | Plain-TypeScript orchestration (`if` / `for` / `await` / `Promise.all`) with `ctx.step` as the observability + retry boundary |
| **Tools** | `createToolFromAgent`, `createToolFromWorkflow` | Wrap an agent or workflow as an AI SDK `Tool` |
| **Templates** | `createTemplate`, `TemplateEngine` | Handlebars markdown templates validated with Zod, colocated with code |
| **Stores** | `sqliteMessageStore`, `inMemoryMessageStore`, `sqliteWorkflowStore`, `inMemoryWorkflowStore` | Conversation transcripts (`MessageStore`) and run/step/event history (`WorkflowStore`) |
| **Observability** | `inMemoryEventLog`, `RunEvent` types, `WorkflowObserver` / `AgentObserver` | Push-based event stream (`step_*`, `agent_*`, `workflow_*`, and author `ctx.emit` custom events) |
| **Project** | `loadAdlProject`, `findAdlProjectRootFromCwd`, `watchAdlProject` | Discovers and loads an `adl.config.*` project — the same path the CLI and inspection UI use |
| **Result** | `ok`, `err`, `unwrap`, `fromThrowable` | A small `Result<T, E>` helper (`@agent-dev-lab/core/result`) safe for inspector payloads and server-function returns |

Every agent call and workflow run is one AI SDK `streamText` invocation under the hood — there's no parallel execution model or workflow graph DSL to learn beyond `ctx.step` for retry/observability boundaries and `otherWorkflow.run(input)` for nesting.

## Subpath exports

| Import | Contents |
| --- | --- |
| `@agent-dev-lab/core` | Everything above |
| `@agent-dev-lab/core/project` | Project discovery/loading only (`loadAdlProject`, `watchAdlProject`, `AdlProjectConfig`) — used by the CLI and inspection UI |
| `@agent-dev-lab/core/db` | SQLite helpers (`openAdlSqlite`, `resolveAdlSqlitePath`, `DEFAULT_SQLITE_RELATIVE_PATH`) backing the SQLite stores |
| `@agent-dev-lab/core/logging` | `createLogger` — a small Pino wrapper (`LOG_LEVEL` env, JSON output) |
| `@agent-dev-lab/core/result` | The `Result<T, E>` helpers standalone |
| `@agent-dev-lab/core/eslint` | Shared ESLint flat config used across ADL projects |
| `@agent-dev-lab/core/tsconfig/node.json` | Shared `tsconfig` base for Node/Bun ADL projects |

There's no `@agent-dev-lab/common` package — ESLint and tsconfig live on `core` instead of a separate package.

## An ADL project

An ADL **project** is any directory with an `adl.config.*` file at its root — the single discovery surface `loadAdlProject()`, the CLI, and the inspection UI all use:

```ts
import type { AdlProjectConfig } from "@agent-dev-lab/core";
import { adl } from "#adl";

import { researcher } from "./agents/researcher";
import { literatureReview } from "./workflows/literature-review";

export default {
  name: "my-research",
  adl, // required for CLI / inspection UI execution
  agents: [researcher],
  workflows: [literatureReview],
} satisfies AdlProjectConfig;
```

```ts
import { loadAdlProject } from "@agent-dev-lab/core";

const project = await loadAdlProject();
const workflow = project.getWorkflow("literature-review");
const output = await workflow!.run({ topic: "CRISPR delivery" }).result;
```

`bunx @agent-dev-lab/cli init my-research` scaffolds this layout for you. See [Project Setup](https://agent-dev-lab.com/guides/project-setup/) for the recommended `src/` structure and the `#adl` import alias.

## Documentation

- [Overview](https://agent-dev-lab.com/guides/overview/)
- [Runtime](https://agent-dev-lab.com/core/runtime/) — `createAdlRuntime`, workflow context, OpenTelemetry
- [Agents](https://agent-dev-lab.com/core/agents/) — `adl.createAgent`, [`stopWhen`](https://ai-sdk.dev/docs/agents/loop-control), memory, structured output
- [Workflows](https://agent-dev-lab.com/core/workflows/) — `adl.createWorkflow`, `ctx.step`, retry/resumability
- [Project Config](https://agent-dev-lab.com/core/project/) — registry shape, `loadAdlProject`
- [API Reference](https://agent-dev-lab.com/api/readme/) — generated from this package's JSDoc

## License

[MIT](https://github.com/jsimonrichard/agent-dev-lab/blob/main/LICENSE) © J. Simon Richard
