---
title: Project config
description: adl.config.ts shape, loadAdlProject, and execution entrypoints.
---

The project config module is the **discovery surface** for CLI, inspection UI, and `loadAdlProject()`. Implementations can live at arbitrary paths; only `adl.config.*` at the project root is required.

## Design decisions

- **Static registry** at load time — no dynamic registration or runtime plugin scan.
- **Arrays** of definitions; each carries its own **`id`** (agents/workflows) or **`name`** (templates from filename).
- **Runtime via config** — tooling reads `config.adl` from the loaded config; it does not import a project runtime file by convention path.
- **JSON config** (`adl.config.json`) suits `name` only — registries and `adl` need TS/JS for imports.

## AdlProjectConfig

```ts
import type { AdlProjectConfig } from "@agent-dev-lab/core";
import { adl } from "#adl";

import { researcher, writer } from "./agents";
import { literatureReview, quickSummary } from "./workflows";
import { findPapersPrompt, outlinePrompt } from "./prompts";

export { adl }; // optional — tooling uses the default export's `adl` field

export default {
  name: "my-research",

  /** Required for CLI / inspection UI execution — not a fixed file path */
  adl,

  agents: [researcher, writer],
  workflows: [literatureReview, quickSummary],
  templates: [findPapersPrompt, outlinePrompt],

  tools: {
    /* registry-only — runtime merge uses createAdlRuntime({ tools }) */
  },
} satisfies AdlProjectConfig;
```

Validation at load time:

- `name` required
- Unique **`id`** per agent/workflow (throws on duplicate)
- Unique **`name`** per template (throws on duplicate)

## loadAdlProject

```ts
import { loadAdlProject, type LoadedAdlProject } from "@agent-dev-lab/core";

const project: LoadedAdlProject = await loadAdlProject();

project.getAdl();
project.getWorkflow("literature-review");
project.listAgentIds();
```

Discovery walks upward from cwd for `adl.config.*` (`findAdlProjectRootFromCwd`) or accepts an explicit root via `ADL_PROJECT_ROOT`. The inspection UI uses the same `loadAdlProject()` path as the CLI — never a hard-coded `src/adl.ts` import.

Before the config module is evaluated, `loadAdlProjectEnv()` applies Next.js-style `.env*` files from that project root to `process.env` (existing values win). See [Project setup](/guides/project-setup/#environment-variables).

## Execution

**One primitive:** `workflow.run(input)` — no separate `runWorkflow()` helper.

| Entry                     | What it does                              |
| ------------------------- | ----------------------------------------- |
| **`workflow.run(input)`** | The execution primitive                   |
| **`adl run <id>`**        | Load project → `getWorkflow(id).run(...)` |
| **`adl dev` / UI**        | List ids + start / inspect runs           |
| **Direct import**         | Skip registry; still use `.run`           |

```ts
import { loadAdlProject } from "@agent-dev-lab/core";

import { literatureReview } from "./workflows/literature-review";

// By reference
const handle = literatureReview.run({ topic: "CRISPR delivery" });
const output = await handle.result;

// By id after loadAdlProject
const project = await loadAdlProject();
const workflow = project.getWorkflow("literature-review");
const handleById = workflow!.run({ topic: "CRISPR delivery" });
```

### WorkflowRunHandle

- **`workflowRunId`** — available immediately for store subscription / future SSE
- **`result`** — `Promise<Output>`
- **`cancel()`** — cooperative cancellation (partial propagation today)

Authors receive `WorkflowContext` inside `adl.createWorkflow({ run: async (input, ctx) => … })`.

## CLI

```bash
adl init my-research
adl run literature-review --input '{"topic":"…"}'
adl workflows list
adl agents list
adl dev
```

## Why registries stay static

| Scenario                         | Approach                                               |
| -------------------------------- | ------------------------------------------------------ |
| Different models per environment | `defaults` or env in `adl.config.ts`                   |
| A/B two workflows                | List both; choose at CLI or `getWorkflow(id).run(...)` |
| Monorepo multiple projects       | Multiple roots; `loadAdlProject({ root })` each        |

See [Project setup](/guides/project-setup/) and [Runtime](/core/runtime/).
