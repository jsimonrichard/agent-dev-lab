---
title: Project Config
description: adl.config.ts shape, loadAdlProject, and execution entrypoints.
---

The project config module is the **discovery surface** for CLI, inspection UI, and `loadAdlProject()`. Implementations can live at arbitrary paths; only `adl.config.*` at the project root is required.

## Design decisions

- **Registry arrays** at load time — agents, workflows, and templates are indexed when `loadAdlProject()` runs (and again on `reload()`).
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
    /* registry-only — runtime merge uses createAdlRuntime({ tools }).
       Future UI: list and run a tool manually (no agent turn). */
  },
} satisfies AdlProjectConfig;
```

Validation at load time:

- `name` required
- Unique **`id`** within agents and within workflows (separate namespaces; throws on same-kind duplicate)
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

Before the config module is evaluated, `loadAdlProjectEnv()` applies Next.js-style `.env*` files from that project root to `process.env` (existing values win). See [Project Setup](/guides/project-setup/#environment-variables).

## Reloading a project

`loadAdlProject()` evaluates `adl.config.*` once, with no reload of its own. `adl dashboard` layers a file watcher on top in dev mode (a Vite plugin calls `reload()` on registry/template changes) — the rest of this section describes that behavior. `adl dashboard --serve`, and published installs which default to `--serve`, run **without** a watcher: restart after any change. `.env*` edits need a restart either way — see "Not reloaded" below.

**CLI execution** (`adl workflow run`, `adl agent run`, list, etc.) loads the project once and exits.

For custom tooling, `LoadedAdlProject.reload()` re-imports the config, and `watchAdlProject()` notifies you when source files change.

**What a reload updates:** agent/workflow definitions, templates, and runtime **observers** from a fresh evaluation of the runtime module (typically `src/adl.ts`). File-backed prompt templates may also re-read from disk on each `render()` while a watcher is active.

**Prompt caching:** one-shot CLI invocations and `adl dashboard` load each prompt `.md` once when the template is created. A `reload()` or watcher-driven re-import picks up `.md` edits.

**What stays pinned:** the same `MessageStore` and `WorkflowStore` **object identities** on the runtime so transcripts, run history, and SQLite connections survive. Changing store _implementation_ or sqlite path in `src/adl.ts` does not take effect until the process restarts. Per-agent `memory.store` / `createAgent(..., { stores })` overrides are new objects on each re-import and are **not** pinned — those conversations reset on reload. Per-conversation system prompts are pinned on first episode (see [Agents](/core/agents/)).

**In-flight runs:** workflows and agent episodes that already started keep the definitions they were created with; new runs use the reloaded registry.

**Failed reload:** syntax errors or duplicate ids leave the previous registry in place; `lastReloadError` reports the failure.

**Ignored paths:** watchers are not attached to `node_modules`, `.git`, `.data` (including SQLite WAL files), `dist`, `.output`, or `.turbo`.

**Not reloaded:** `.env*` files (`loadAdlProjectEnv` does not overwrite existing `process.env` values). Restart after changing secrets, `ADL_SQLITE_PATH`, or the store implementation in `src/adl.ts`.

## Execution

**One primitive:** `workflow.run(input)` — no separate `runWorkflow()` helper.

| Entry                       | What it does                                                              |
| --------------------------- | ------------------------------------------------------------------------- |
| **`workflow.run(input)`**   | The execution primitive                                                   |
| **`adl workflow run <id>`** | Load project → `getWorkflow(id).run(...)`                                 |
| **`adl agent run <id>`**    | Load project → `getAgent(id).run({ user })` — `--input` is a plain string |
| **`adl dashboard` / UI**    | List ids + start / inspect runs                                           |
| **Direct import**           | Skip registry; still use `.run`                                           |

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
bunx @agent-dev-lab/cli init my-research
cd my-research && bun install
bunx adl workflow run demo-counter --input '{"steps":3}'
bunx adl workflow run ask --input '{"question":"What is Agent Dev Lab?"}'
bunx adl workflow list
bunx adl agent list
bunx adl agent run assistant --input "What is Agent Dev Lab?"
bunx adl dashboard
```

## Why registries stay static

| Scenario                         | Approach                                               |
| -------------------------------- | ------------------------------------------------------ |
| Different models per environment | `defaults` or env in `adl.config.ts`                   |
| A/B two workflows                | List both; choose at CLI or `getWorkflow(id).run(...)` |
| Several projects in one repo     | Multiple roots; `loadAdlProject({ root })` each        |

See [Project Setup](/guides/project-setup/), [Inspection UI](/guides/inspection-ui/), and [Runtime](/core/runtime/).
