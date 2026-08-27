---
title: Project config
description: adl.config.ts shape, loadAdlProject, and execution entrypoints.
---

The project config module is the **discovery surface** for CLI, inspection UI, and `loadAdlProject()`. Implementations can live at arbitrary paths; only `adl.config.*` at the project root is required.

## Design decisions

- **Registry arrays** at load time — agents, workflows, and templates are indexed when `loadAdlProject()` runs (or on hot reload in dev).
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

## Hot reload (dev)

During `adl dashboard` (Vite) and `bun run dev:web`, the inspection UI watches the ADL project tree and re-imports `adl.config.*` when registry source changes (`.ts`, `.js`, prompt `.md`, etc.). Use `LoadedAdlProject.reload()` or `watchAdlProject()` from `@agent-dev-lab/core` in custom tooling.

**Production / serve:** `adl dashboard --serve` and published installs run the Nitro build with `ADL_INSPECTOR_SERVE=1`. The file watcher is disabled; registry and catalog metadata are fixed until the process restarts.

**CLI execution (`adl run`, list, etc.):** each invocation loads the project once via `loadAdlProject()` and exits. There is no watcher, no SSE, and no `reload()` — hot reload does not affect standalone CLI runs.

**What updates:** agent/workflow definitions, templates, and runtime **observers** from a fresh evaluation of `src/adl.ts`. In dev, file-backed prompt templates may also re-read from disk on each `render()` while the project watcher is active (`ADL_PROJECT_WATCH=1`).

**Prompt caching:** production serve, `adl run`, and other one-shot CLI invocations load each prompt `.md` once when the template is created. Dev hot reload still picks up `.md` edits via registry reload or render-time re-read.

**What stays pinned:** the same `MessageStore` and `WorkflowStore` **object identities** on the runtime so transcripts, run history, and SQLite connections survive. Changing store _implementation_ or sqlite path in `src/adl.ts` does not take effect until the process restarts. Per-agent `memory.store` / `createAgent(..., { stores })` overrides are new objects on each re-import and are **not** pinned — those conversations reset on reload. Per-conversation system prompts are pinned on first episode (see [Agents](/core/agents/)).

**In-flight runs:** workflows and agent episodes that already started keep the definitions they were created with; new runs use the reloaded registry.

**Failed reload:** syntax errors or duplicate ids leave the previous registry in place; the UI reports `lastReloadError`.

**Ignored paths:** watchers are not attached to `node_modules`, `.git`, `.data` (including SQLite WAL files), `dist`, `.output`, or `.turbo`. Events from those trees are also ignored if they somehow fire.

**Not hot-reloaded:** `.env*` files (`loadAdlProjectEnv` does not overwrite existing `process.env` values). Restart the dev server after changing secrets, `ADL_SQLITE_PATH`, or the store implementation in `src/adl.ts`.

The UI subscribes to `GET /api/project/events` (SSE) and refreshes sidebars and agent/workflow catalog metadata automatically.

## Execution

**One primitive:** `workflow.run(input)` — no separate `runWorkflow()` helper.

| Entry                     | What it does                              |
| ------------------------- | ----------------------------------------- |
| **`workflow.run(input)`** | The execution primitive                   |
| **`adl run <id>`**        | Load project → `getWorkflow(id).run(...)` |
| **`adl dashboard` / UI**  | List ids + start / inspect runs           |
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
- **`cancel()`** — aborts `ctx.signal`, in-flight steps, and child agent `streamText` calls on this run

Authors receive `WorkflowContext` inside `adl.createWorkflow({ run: async (input, ctx) => … })`.

## CLI

```bash
adl init my-research
adl run demo-counter --input '{"steps":3}'
adl run ask --input '{"question":"What is Agent Dev Lab?"}'
adl workflows list
adl agents list
adl dashboard
```

## Why registries stay static

| Scenario                         | Approach                                               |
| -------------------------------- | ------------------------------------------------------ |
| Different models per environment | `defaults` or env in `adl.config.ts`                   |
| A/B two workflows                | List both; choose at CLI or `getWorkflow(id).run(...)` |
| Monorepo multiple projects       | Multiple roots; `loadAdlProject({ root })` each        |

See [Project setup](/guides/project-setup/), [Inspection UI](/guides/inspection-ui/), and [Runtime](/core/runtime/).
