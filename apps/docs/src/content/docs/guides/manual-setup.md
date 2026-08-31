---
title: Manual Setup
description: Adding ADL to an existing project by hand, and exactly what the framework requires.
---

Most projects should start with [`adl init`](/guides/project-setup/) — it scaffolds the recommended layout for you. This page is for adding ADL to an existing TypeScript project instead, or for understanding exactly what's required versus just convention.

## What is required

| Requirement                         | Notes                                                                 |
| ------------------------------------ | ---------------------------------------------------------------------- |
| `adl.config.*` at project root      | One of `ADL_CONFIG_FILENAMES` (`.ts`, `.mts`, `.js`, `.mjs`, `.json`) |
| `name: string` on the config        | Shown in CLI and inspection UI                                        |
| `adl` on the config (for execution) | `createAdlRuntime()` instance — how tooling gets the runtime          |

Everything else on this page — folder layout, the `#adl` alias, `src/adl.ts` — is a recommendation that `adl init` follows, not a framework requirement. The runtime instance itself is also not required at a fixed path (only `config.adl` matters), but **`src/adl.ts`** is the recommended place to construct and export it.

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

Your `adl.config.ts` just needs to **reference** the runtime (and can optionally re-export it) — see [Recommended layout](#recommended-layout) below for where that reference typically comes from.

## `#adl` import alias (recommended)

Registry modules import the runtime often. Set a **TypeScript path alias** and a matching
`package.json` `"imports"` entry so every file can use the same stable import — no
`../../../src/adl` as your tree grows.

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

In `package.json` (required for Node / Bun runtime resolution of `#adl`):

```json
{
  "imports": {
    "#adl": "./src/adl.ts"
  }
}
```

Then use it everywhere you define agents, workflows, or templates:

```ts
// src/agents/researcher.ts
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

This structure matches `adl init` (agents and workflows under `src/`):

```
my-research/
  package.json           # imports["#adl"] → ./src/adl.ts
  tsconfig.json          # paths["#adl"] → ./src/adl.ts
  adl.config.ts          # registry + metadata; sets config.adl
  .env.example
  src/
    adl.ts               # createAdlRuntime() — recommended runtime module
    model.ts
    agents/
      assistant.ts
    workflows/
      demo-counter.ts
      ask.ts
```

Registry modules should import `adl` via **`#adl`** (or your alias), **not** from `adl.config.ts`, to avoid import cycles (`adl.config` imports agents; agents must not import `adl.config`).

```ts
// src/adl.ts
import { createAdlRuntime, sqliteMessageStore, sqliteWorkflowStore } from "@agent-dev-lab/core";
import { openai } from "@ai-sdk/openai";

export const adl = createAdlRuntime({
  defaults: { model: openai("gpt-4o-mini") },
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

`adl.config.ts` then references that runtime (and can optionally re-export it):

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

See [Project Config](/core/project/) and [Runtime](/core/runtime/) for API detail, and [Project Setup](/guides/project-setup/) for the CLI-driven quick start and environment variable handling.
