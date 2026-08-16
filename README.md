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

Requires [Bun](https://bun.sh) `1.3.13`.

```bash
bunx @agent-dev-lab/cli init my-research
cd my-research
bun install
export OPENAI_API_KEY=sk-...          # needed for the sample LLM workflow
adl run demo-counter --input '{"steps":3}'
adl run literature-review --input '{"topic":"CRISPR delivery"}'
adl dev                               # inspection UI on :3000
```

Or add the packages to an existing project:

```bash
bun add @agent-dev-lab/core @agent-dev-lab/cli @ai-sdk/openai
```

### Environment variables

ADL loads `.env` files from the project root (the directory with `adl.config.*`), the same way [Next.js](https://nextjs.org/docs/pages/guides/environment-variables) does — including `.env.local` and `.env.[mode]`. Existing process environment values are not overwritten. This applies to `adl dev`, `adl run`, and `bun run dev:web` (playground `.env`).

| Variable           | Purpose                                                                   |
| ------------------ | ------------------------------------------------------------------------- |
| `OPENAI_API_KEY`   | Provider key for the sample agent (`@ai-sdk/openai`)                      |
| `ADL_MODEL`        | Model id (default `gpt-4o-mini`)                                          |
| `ADL_SQLITE_PATH`  | SQLite file (default `.data/agent-dev-lab.sqlite` under the project root) |
| `ADL_PROJECT_ROOT` | Override project discovery for CLI / UI                                   |
| `DEBUG=adl`        | Print CLI stack traces                                                    |

## Example

Author a runtime, an agent, and a workflow as plain TypeScript:

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
  instructions: "You are a research assistant.",
});

const review = adl.createWorkflow({
  id: "literature-review",
  run: async (input: { topic: string }, ctx) => {
    await ctx.step("research", async ({ ctx: child }) => {
      await researcher.run({ memoryScope: child.memoryScopeWithSuffix("notes"), user: input.topic });
    });
    return { topic: input.topic };
  },
});

const handle = review.run({ topic: "CRISPR delivery" });
await handle.result;
```

An ADL **project** is any directory with an `adl.config.*` file at its root — the single discovery surface for the CLI, inspection UI, and `loadAdlProject()`. See [Project setup](https://agent-dev-lab.com/guides/project-setup/) for the recommended layout and the `#adl` import alias.

## Development

Working on the framework itself (this monorepo). Requires [Bun](https://bun.sh) `1.3.13` (declared in the root `packageManager` field).

```bash
bun install
bun run dev:docs   # docs site on :4321
bun run dev:web    # inspection UI on :3000
```

No `.env` file or external services are required. LLM provider API keys are needed once agent execution is wired up.

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

| Area                                                         | Status      |
| ------------------------------------------------------------ | ----------- |
| `createAdlRuntime`, agents, workflows, templates             | Implemented |
| `agent.run` / `agent.stream` via AI SDK `streamText`         | Implemented |
| `workflow.run` / `workflow.stream`, `ctx.step`, step caching | Implemented |
| `MessageStore` + `WorkflowStore` (in-memory + SQLite)        | Implemented |
| Observers, `RunRecorder`, run events                         | Implemented |
| `loadAdlProject` + registry indexes                          | Implemented |
| CLI `adl init` / `adl run` / list / `adl dev`                | Implemented |
| Inspection UI run waterfall / SSE / cancel                   | Implemented |
| Playground sample agent + workflow                           | Implemented |

## Documentation

Full documentation is hosted at [agent-dev-lab.com](https://agent-dev-lab.com). You can also run the docs site locally with `bun run dev:docs` (port 4321).

- [Overview](https://agent-dev-lab.com/guides/overview/) — high-level orientation
- [Project setup](https://agent-dev-lab.com/guides/project-setup/) — required vs. recommended layout, the `#adl` alias
- [Runtime](https://agent-dev-lab.com/core/runtime/) — `createAdlRuntime`, workflow context propagation
- [Agents](https://agent-dev-lab.com/core/agents/) — `adl.createAgent`, memory, structured output
- [Workflows](https://agent-dev-lab.com/core/workflows/) — `adl.createWorkflow`, steps, keys, nesting
- [Project config](https://agent-dev-lab.com/core/project/) — registry, `loadAdlProject`

Coding-agent tracking notes (v1 gaps, deferred design) live in [`notes/`](notes/).

## License

[MIT](LICENSE) © J. Simon Richard
