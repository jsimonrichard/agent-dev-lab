<p align="center">
  <img src="https://raw.githubusercontent.com/jsimonrichard/agent-dev-lab/main/assets/brand/logo-lockup.svg" alt="Agent Dev Lab" height="56" />
</p>

Flexible TypeScript tooling for developing, debugging, and visualizing AI agents and workflows.

Agent Dev Lab (ADL) is a TypeScript-first framework for experimenting with agentic workflows. It pairs a headless core library built on top of [Vercel's AI SDK](https://ai-sdk.dev/) with an optional inspection UI and a CLI — so you can author agents and workflows as plain TypeScript, run them from scripts, tests, or a server, and inspect the resulting telemetry.

<p align="center">
  <img src="https://raw.githubusercontent.com/jsimonrichard/agent-dev-lab/main/assets/screenshots/dashboard.png" alt="ADL inspection UI showing a workflow run's waterfall of steps, with a step's output selected in the inspector panel" width="100%" />
</p>

<p align="center"><sub>The inspection UI (<code>adl dashboard</code>): a workflow run's waterfall, step-by-step.</sub></p>

## Principles

- **Runtime/UI split** — workflows run from scripts, tests, or a server; the UI reads persisted output.
- **TypeScript-first** — plain TS orchestration (`if` / `for` / `try` / `await` / `Promise.all`), no workflow graph DSL.
- **AI SDK native** — `ModelMessage`, `streamText`, and `tool()` without parallel abstractions.
- **Colocated prompts** — markdown beside code; templates via `createTemplate`.

## Getting started

Works with **npm** and **Node 22+**, or **Bun** — no Bun requirement to use ADL in your own project.

```bash
bunx @agent-dev-lab/cli@latest init my-research
# or: npx @agent-dev-lab/cli@latest init my-research
cd my-research
bun install
# or: npm install
cp .env.example .env   # then set OPENAI_API_KEY
bunx adl workflow run demo-counter --input '{"steps":3}'
bunx adl workflow run ask --input '{"question":"What is Agent Dev Lab?"}'
bunx adl agent run assistant --input "What is Agent Dev Lab?"
bunx adl dashboard      # inspection UI (Nitro for published installs)
# or with npm: npx adl ...
```

Or add the packages to an existing project (still need `adl.config.ts`, `src/adl.ts`, and `.env`):

```bash
bun add @agent-dev-lab/core @agent-dev-lab/cli @agent-dev-lab/web @ai-sdk/openai
# or: npm install @agent-dev-lab/core @agent-dev-lab/cli @agent-dev-lab/web @ai-sdk/openai
cp .env.example .env   # or create one with OPENAI_API_KEY
```

### Environment variables

ADL loads `.env` files from the project root (the directory with `adl.config.*`), the same way [Next.js](https://nextjs.org/docs/pages/guides/environment-variables) does — including `.env.local` and `.env.[mode]`. Existing process environment values are not overwritten. This applies to `adl dashboard`, `adl workflow run`, and `bun run dev:web` (playground `.env`).

| Variable           | Purpose                                                                   |
| ------------------ | ------------------------------------------------------------------------- |
| `OPENAI_API_KEY`   | Provider key for the sample agent (`@ai-sdk/openai`)                      |
| `ADL_SQLITE_PATH`  | SQLite file (default `.data/agent-dev-lab.sqlite` under the project root) |
| `ADL_PROJECT_ROOT` | Override project discovery for CLI / UI                                   |
| `DEBUG=adl`        | Print CLI stack traces                                                    |

Model selection isn't a framework-level env var — it's ordinary code where you build the model (see [Project Setup](https://agent-dev-lab.com/guides/project-setup/) for how the `adl init` scaffold wires this up, if that's the path you're on).

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
  systemPrompt: "You are a research assistant.",
});

const review = adl.createWorkflow({
  id: "literature-review",
  run: async (input: { topic: string }, ctx) => {
    await ctx.step("research", async ({ ctx: child }) => {
      await researcher.run({
        memoryScope: child.memoryScopeWithSuffix("notes"),
        user: input.topic,
      });
    });
    return { topic: input.topic };
  },
});

const handle = review.run({ topic: "CRISPR delivery" });
await handle.result;
```

An ADL **project** is any directory with an `adl.config.*` file at its root — the single discovery surface for the CLI, inspection UI, and `loadAdlProject()`. See [Project Setup](https://agent-dev-lab.com/guides/project-setup/) for the recommended layout and the `#adl` import alias.

## Development

Working on the framework itself (this monorepo, as opposed to a project built with ADL). Requires [Bun](https://bun.sh) `1.3.13` (declared in the root `packageManager` field) — Bun is not required to use ADL in your own project, see [Getting started](#getting-started).

```bash
bun install
bun run dev:docs   # docs site on :4321
bun run dev:web    # inspection UI on :3000
```

No external services are required. Put LLM provider keys in the playground (or your project) `.env` when you want to execute agents.

All standard scripts live in the root `package.json` and run through Turbo:

| Command                | Description                                             |
| ---------------------- | ------------------------------------------------------- |
| `bun install`          | Install dependencies                                    |
| `bun run dev`          | Run web + docs in parallel                              |
| `bun run dev:web`      | Framework UI dev against `apps/playground`              |
| `bun run dev:cli`      | `adl dashboard` using the nearest user project from cwd |
| `bun run dev:docs`     | Docs site on port 4321                                  |
| `bun run build`        | Build all packages                                      |
| `bun run lint`         | ESLint across all packages                              |
| `bun run typecheck`    | TypeScript checking via Turbo                           |
| `bun run test`         | Run package tests via Turbo (`core`, `cli`, `web`)      |
| `bun run format`       | Prettier write across the repo                          |
| `bun run format:check` | Prettier check (used in CI)                             |

## Monorepo layout

Bun + Turborepo monorepo.

| Package                     | Path              | Role                                                                                                     |
| --------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------- |
| `@agent-dev-lab/core`       | `packages/core`   | Headless runtime — agents, workflows, templates, stores; also `./db`, `./eslint`, `./tsconfig/node.json` |
| `@agent-dev-lab/web`        | `apps/web`        | TanStack Start (React 19) inspection UI — port 3000                                                      |
| `@agent-dev-lab/cli`        | `apps/cli`        | Stricli CLI (`adl`)                                                                                      |
| `@agent-dev-lab/docs`       | `apps/docs`       | Astro Starlight guides + TypeDoc API reference — port 4321                                               |
| `@agent-dev-lab/playground` | `apps/playground` | Sample ADL project (`adl.config.ts`) for framework dev                                                   |

## Documentation

Full documentation is hosted at [agent-dev-lab.com](https://agent-dev-lab.com).

- [Overview](https://agent-dev-lab.com/guides/overview/) — high-level orientation
- [Project Setup](https://agent-dev-lab.com/guides/project-setup/) — the recommended way to start a project (`adl init`)
- [Manual Setup](https://agent-dev-lab.com/guides/manual-setup/) — adding ADL to an existing project by hand
- [Inspection UI](https://agent-dev-lab.com/guides/inspection-ui/) — `adl dashboard`, waterfalls, agent conversations
- [Gotchas](https://agent-dev-lab.com/guides/gotchas/) — sharp edges worth knowing about before they surprise you
- [Runtime](https://agent-dev-lab.com/core/runtime/) — `createAdlRuntime`, workflow context, OpenTelemetry
- [Agents](https://agent-dev-lab.com/core/agents/) — `adl.createAgent`, [`stopWhen`](https://ai-sdk.dev/docs/agents/loop-control), `adl agent run`
- [Workflows](https://agent-dev-lab.com/core/workflows/) — `adl.createWorkflow`, `ctx.emit`, `createWorkflowFromAgent`
- [Project Config](https://agent-dev-lab.com/core/project/) — registry, `loadAdlProject`

## License

[MIT](LICENSE) © J. Simon Richard
