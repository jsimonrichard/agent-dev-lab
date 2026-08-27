---
title: Project setup
description: Recommended layout for an ADL project and how tooling discovers the runtime.
---

An ADL **project** is a directory with `adl.config.*` at the project root. That file is the **only required discovery surface** for the CLI, inspection UI, and `loadAdlProject()`.

Everything else — folder layout for agents and workflows, prompt paths — is a **recommendation**, not a framework requirement. The runtime instance itself is also not required at a fixed path for tooling (only `config.adl` matters), but **`src/adl.ts`** is the recommended place to construct and export it.

## What is required

| Requirement                         | Notes                                                                 |
| ----------------------------------- | --------------------------------------------------------------------- |
| `adl.config.*` at project root      | One of `ADL_CONFIG_FILENAMES` (`.ts`, `.mts`, `.js`, `.mjs`, `.json`) |
| `name: string` on the config        | Shown in CLI and inspection UI                                        |
| `adl` on the config (for execution) | `createAdlRuntime()` instance — how tooling gets the runtime          |

## How tooling accesses the runtime

The inspection UI, CLI, and `loadAdlProject()` **never import a project runtime file directly** (e.g. they do not reach into `src/adl.ts` by path). They:

1. Find the project root (`adl.config.*` or `ADL_PROJECT_ROOT`)
2. Call `loadAdlProject()`
3. Read the runtime from **`project.config.adl`** or **`project.getAdl()`**

```ts
import { loadAdlProject } from "@agent-dev-lab/core";

const project = await loadAdlProject();
const adl = project.getAdl(); // same as project.config.adl
const workflow = project.getWorkflow("literature-review");
```

Your `adl.config.ts` should **reference** the runtime (and optionally re-export it):

```ts
import type { AdlProjectConfig } from "@agent-dev-lab/core";
import { adl } from "#adl";

import { researcher } from "./agents/researcher";
import { literatureReview } from "./workflows/literature-review";

export { adl }; // optional named re-export for in-project imports

export default {
  name: "my-research",
  adl,
  agents: [researcher],
  workflows: [literatureReview],
} satisfies AdlProjectConfig;
```

`export { adl }` from `adl.config.ts` is optional. What matters for tooling is the **`adl` field on the default export**.

## `#adl` import alias (recommended)

Registry modules import the runtime often. Set a **TypeScript path alias** so every file can use the same stable import — no `../../../src/adl` as your tree grows.

In `tsconfig.json` at the project root (Bun and most bundlers honor `paths`):

```json
{
  "compilerOptions": {
    "paths": {
      "#adl": ["./src/adl.ts"]
    }
  }
}
```

Then use it everywhere you define agents, workflows, or templates:

```ts
// agents/researcher.ts
import { openai } from "@ai-sdk/openai";

import { adl } from "#adl";

export const researcher = adl.createAgent({
  id: "researcher",
  model: openai("gpt-4o"),
  systemPrompt: "You are a research assistant.",
});
```

The `#adl` prefix is the recommended convention (short, unlikely to clash with npm scopes). You may choose another alias name; keep one alias per project.

## Recommended layout

This structure keeps import cycles predictable when registry modules call `adl.createAgent`:

```
my-research/
  tsconfig.json          # paths["#adl"] → ./src/adl.ts
  adl.config.ts          # registry + metadata; sets config.adl
  src/
    adl.ts               # createAdlRuntime() — recommended runtime module
  agents/
    researcher.ts
  workflows/
    literature-review.ts
  prompts/
    …
```

| Piece                | Role                                                                          |
| -------------------- | ----------------------------------------------------------------------------- |
| **`adl.config.ts`**  | Registry (`agents[]`, `workflows[]`, …) and **`adl`** reference for tooling   |
| **`src/adl.ts`**     | `createAdlRuntime({ stores, observers })` — keeps config free of store wiring |
| **Registry modules** | `import { adl } from "#adl"` — not from `adl.config`                          |

Registry modules should import `adl` via **`#adl`** (or your alias), **not** from `adl.config.ts`, to avoid import cycles (`adl.config` imports agents; agents must not import `adl.config`).

```ts
// src/adl.ts
import { createAdlRuntime, sqliteMessageStore, sqliteWorkflowStore } from "@agent-dev-lab/core";
import { openai } from "@ai-sdk/openai";

export const adl = createAdlRuntime({
  defaults: { model: openai(process.env.ADL_MODEL ?? "gpt-4o-mini") },
  stores: {
    message: sqliteMessageStore(),
    workflow: sqliteWorkflowStore(),
  },
});
```

Use `inMemoryMessageStore` / `inMemoryWorkflowStore` (or `createTestRuntime()`) in unit tests.

```ts
// agents/researcher.ts
import { adl } from "#adl";

export const researcher = adl.createAgent({
  id: "researcher",
  systemPrompt: "You are a research assistant.",
});
```

**Avoid** heavy store construction inline in `adl.config.ts` when registry modules also import from config — that pattern tends to create cycles. Keep runtime wiring in **`src/adl.ts`** and reference it from config.

## Loading a project

```ts
import { loadAdlProject } from "@agent-dev-lab/core";

const project = await loadAdlProject();
const workflow = project.getWorkflow("literature-review");
if (!workflow) throw new Error("Unknown workflow");

const handle = workflow.run({ topic: "CRISPR delivery" });
const output = await handle.result;
```

`loadAdlProject` indexes agents/workflows by `id` and templates by `name`. Duplicate ids throw at load time.

## CLI

```bash
adl init my-research
adl workflows list
adl agents list
adl run demo-counter --input '{"steps":3}'
adl run ask --input '{"question":"What is Agent Dev Lab?"}'
adl dashboard
```

- **`adl init`** — scaffold `adl.config.ts`, SQLite-backed `src/adl.ts`, demo-counter, a sample `ask` workflow, and `@agent-dev-lab/web` for `adl dashboard`
- **`adl run`** — `loadAdlProject()` → `getWorkflow(id).run(input)`
- **`adl dashboard`** — [inspection UI](/guides/inspection-ui/); sets `ADL_PROJECT_ROOT`. Published installs serve the Nitro build; the monorepo uses Vite.

### Environment variables

`loadAdlProject()` (and the inspection UI / CLI, which all go through it) loads `.env*` files from the **ADL project root** — the directory that contains `adl.config.*`, not the process cwd. That is why `bun run dev:web` picks up `apps/playground/.env` even though Vite starts in `apps/web`.

Precedence matches [Next.js](https://nextjs.org/docs/pages/guides/environment-variables) (highest first). Values already set in the process environment are never overwritten:

| File                | When it loads                          |
| ------------------- | -------------------------------------- |
| `.env.[mode].local` | Always, for that mode                  |
| `.env.local`        | All modes except `test`                |
| `.env.[mode]`       | `development`, `production`, or `test` |
| `.env`              | Always                                 |

`mode` is `NODE_ENV` when it is `development` / `production` / `test`, otherwise `development` (so `adl run` still loads `.env.local`). Variable expansion (`$VAR`, `${VAR}`) is supported.

Put provider keys in `.env` or `.env.local` at the project root:

```bash
OPENAI_API_KEY=sk-...
ADL_MODEL=gpt-4o-mini
```

| Variable           | Purpose                                                   |
| ------------------ | --------------------------------------------------------- |
| `OPENAI_API_KEY`   | Provider key for `@ai-sdk/openai` (sample agent)          |
| `ADL_MODEL`        | Model id (default `gpt-4o-mini`)                          |
| `ADL_SQLITE_PATH`  | SQLite file; relative paths resolve from the project root |
| `ADL_PROJECT_ROOT` | Override project discovery                                |
| `DEBUG=adl`        | Print CLI stack traces                                    |

See [Project config](/core/project/) and [Runtime](/core/runtime/) for API detail.
