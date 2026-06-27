# Agent Dev Lab

Flexible TypeScript tooling for developing, debugging, and visualizing AI agents and workflows.

Agent Dev Lab (ADL) is a TypeScript-first workspace for experimenting with agentic workflows. It pairs a headless core library built on top of [Vercel's AI SDK](https://ai-sdk.dev/) with an optional inspection UI, a CLI, and shared infrastructure — so you can author agents and workflows as plain TypeScript, run them from scripts, tests, or a server, and inspect the resulting telemetry.

## Principles

- **Runtime/UI split** — workflows run from scripts, tests, or a server; the UI reads persisted output.
- **TypeScript-first** — plain TS orchestration (`if` / `for` / `try` / `await` / `Promise.all`), no workflow graph DSL.
- **AI SDK native** — `CoreMessage`, `streamText`, and `tool()` without parallel abstractions.
- **Colocated prompts** — markdown beside code; templates via `createTemplate`.

## Monorepo layout

Bun + Turborepo monorepo.

| Package                     | Path              | Role                                                        |
| --------------------------- | ----------------- | ----------------------------------------------------------- |
| `@agent-dev-lab/core`       | `packages/core`   | Headless runtime — agents, workflows, templates, stores     |
| `@agent-dev-lab/common`     | `packages/common` | Shared infra: Drizzle + SQLite, Pino logging, ESLint config |
| `@agent-dev-lab/web`        | `apps/web`        | TanStack Start (React 19) inspection UI — port 3000         |
| `@agent-dev-lab/cli`        | `apps/cli`        | Stricli CLI (`adl`)                                         |
| `@agent-dev-lab/docs`       | `apps/docs`       | Astro Starlight guides + TypeDoc API reference — port 4321  |
| `@agent-dev-lab/playground` | `apps/playground` | Sample ADL project (`adl.config.ts`) for framework dev      |

## Getting started

Requires [Bun](https://bun.sh) `1.3.13` (declared in the root `packageManager` field).

```bash
bun install
bun run dev:docs   # docs site on :4321
bun run dev:web    # inspection UI on :3000
```

No `.env` file or external services are required for basic development. LLM provider API keys are needed once agent execution is wired up.

## Example

Author a runtime, an agent, and a workflow as plain TypeScript:

```ts
import { createAdlRuntime, inMemoryMessageStore, inMemoryWorkflowStore } from "@agent-dev-lab/core";
import { openai } from "@ai-sdk/openai";

export const adl = createAdlRuntime({
  stores: {
    message: inMemoryMessageStore(),
    workflow: inMemoryWorkflowStore(),
  },
});

const researcher = adl.createAgent({
  id: "researcher",
  model: openai("gpt-4o"),
  instructions: "You are a research assistant.",
});

const review = adl.createWorkflow({
  id: "literature-review",
  run: async (input: { topic: string }, ctx) => {
    await ctx.step("research", async ({ ctx: child }) => {
      await researcher.run({ memoryScope: child.memoryScope("notes"), user: input.topic });
    });
    return { topic: input.topic };
  },
});

const handle = review.run({ topic: "CRISPR delivery" });
await handle.result;
```

An ADL **project** is any directory with an `adl.config.*` file at its root — the single discovery surface for the CLI, inspection UI, and `loadAdlProject()`. See [Project setup](apps/docs/src/content/docs/guides/project-setup.md) for the recommended layout and the `#adl` import alias.

## Commands

All standard scripts live in the root `package.json` and run through Turbo:

| Command                | Description                                       |
| ---------------------- | ------------------------------------------------- |
| `bun install`          | Install dependencies                              |
| `bun run dev`          | Run web + docs in parallel                        |
| `bun run dev:web`      | Framework UI dev against `apps/playground`        |
| `bun run dev:cli`      | `adl dev` using the nearest user project from cwd |
| `bun run dev:docs`     | Docs site on port 4321                            |
| `bun run build`        | Build all packages                                |
| `bun run lint`         | ESLint across all packages                        |
| `bun run typecheck`    | TypeScript checking via Turbo                     |
| `bun run test`         | Run `bun test` in `packages/core`                 |
| `bun run format`       | Prettier write across the repo                    |
| `bun run format:check` | Prettier check (used in CI)                       |

## Status

The **headless runtime** in `@agent-dev-lab/core` is usable today without the UI or CLI execution path.

| Area                                                         | Status          |
| ------------------------------------------------------------ | --------------- |
| `createAdlRuntime`, agents, workflows, templates             | Implemented     |
| `agent.run` / `agent.stream` via AI SDK `streamText`         | Implemented     |
| `workflow.run` / `workflow.stream`, `ctx.step`, step caching | Implemented     |
| `MessageStore` + `WorkflowStore` (in-memory defaults)        | Implemented     |
| Observers, `RunRecorder`, run events                         | Implemented     |
| `loadAdlProject` + registry indexes                          | Implemented     |
| SQLite-backed stores                                         | Not implemented |
| CLI `adl run` / list commands                                | Not implemented |
| Inspection UI run waterfall / SSE                            | Not implemented |
| Playground end-to-end sample                                 | Not implemented |

## Documentation

Run the docs site locally with `bun run dev:docs` (port 4321), or browse the source directly:

- [Overview](apps/docs/src/content/docs/guides/overview.md) — high-level orientation
- [Project setup](apps/docs/src/content/docs/guides/project-setup.md) — required vs. recommended layout, the `#adl` alias
- [Runtime](apps/docs/src/content/docs/core/runtime.md) — `createAdlRuntime`, workflow context propagation
- [Agents](apps/docs/src/content/docs/core/agents.md) — `adl.createAgent`, memory, structured output
- [Workflows](apps/docs/src/content/docs/core/workflows.md) — `adl.createWorkflow`, steps, keys, nesting
- [Project config](apps/docs/src/content/docs/core/project.md) — registry, `loadAdlProject`

Coding-agent tracking notes (v1 gaps, deferred design) live in [`notes/`](notes/).

## License

[MIT](LICENSE) © J. Simon Richard
