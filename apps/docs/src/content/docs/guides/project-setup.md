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
import { adl } from "#adl";

export const researcher = adl.createAgent({ id: "researcher" /* … */ });
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
import { createAdlRuntime, inMemoryMessageStore, inMemoryWorkflowStore } from "@agent-dev-lab/core";

export const adl = createAdlRuntime({
  stores: {
    message: inMemoryMessageStore(),
    workflow: inMemoryWorkflowStore(),
  },
});
```

```ts
// agents/researcher.ts
import { adl } from "#adl";

export const researcher = adl.createAgent({ id: "researcher" /* … */ });
```

**Avoid** heavy store construction inline in `adl.config.ts` when registry modules also import from config — that pattern tends to create cycles. Keep runtime wiring in **`src/adl.ts`** and reference it from config.

## Loading a project

```ts
const project = await loadAdlProject();
const workflow = project.getWorkflow("literature-review");
if (!workflow) throw new Error("Unknown workflow");

const handle = workflow.run({ topic: "CRISPR delivery" });
const output = await handle.result;
```

`loadAdlProject` indexes agents/workflows by `id` and templates by `name`. Duplicate ids throw at load time.

## CLI today

- **`adl dev`** — inspection UI; sets `ADL_PROJECT_ROOT` and loads via `loadAdlProject()`
- **`adl run`** / **`adl workflows list`** — planned

See [Project config](/core/project/) and [Runtime](/core/runtime/) for API detail.
