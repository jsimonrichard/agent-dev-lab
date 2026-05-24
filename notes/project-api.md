# Project config & execution entrypoints (draft)

How an ADL **project** declares agents, workflows, templates, and tools, and how the CLI / UI / scripts **run** them.

**Status:** Design for v1 planning. Today `AdlProjectConfig` only has `name`; registries are **not implemented** ([`packages/runtime/src/project/config.ts`](../packages/runtime/src/project/config.ts)).

Related: [`agent-api.md`](./agent-api.md), [`workflow-api.md`](./workflow-api.md), [`message-store.md`](./message-store.md).

---

## Design decision: registry in `adl.config.*`

Expose **workflows, agents, templates, tools** (and optional defaults) from the project config module so everything else stays flexible:

- Implementations live in arbitrary paths (`src/workflows/…`, `src/agents/…`, colocated prompts).
- Only **`adl.config.ts`** (or `.mts` / `.js` / `.mjs`) is the **discovery surface** for the CLI, inspection UI, and `loadAdlProject()`.
- The config file **imports** definitions and assigns them to named registry keys.

We **do not** plan for dynamic registration (runtime plugin scan, conditional agents per request, etc.). The registry is **static** at load time. If a project needs variants, use separate workflows/agents or pass **input** / **`context`** at run time—not hidden registry mutation.

**JSON config (`adl.config.json`):** suitable for `name` + paths only, not for registries (no imports). Registry projects should use TS/JS config.

---

## Example project layout

```
my-research/
  adl.config.ts          # registry + project metadata
  src/
    agents/researcher.ts
    workflows/literature-review.ts
    prompts/…
    tools/search.ts
```

```ts
// adl.config.ts
import type { AdlProjectConfig } from "@agent-dev-lab/runtime";

import { researcher, writer } from "./src/agents/index";
import { literatureReview, quickSummary } from "./src/workflows/index";
import { findPapersPrompt, outlinePrompt } from "./src/prompts/index";
import { searchTool, citeTool } from "./src/tools/index";

export default {
  name: "my-research",

  agents: {
    researcher,
    writer,
  },

  workflows: {
    literatureReview,
    quickSummary,
  },

  templates: {
    findPapers: findPapersPrompt,
    outline: outlinePrompt,
  },

  tools: {
    search: searchTool,
    cite: citeTool,
  },

  /** Optional project-wide defaults (TBD) */
  defaults: {
    // messageStore, model, …
  },
} satisfies AdlProjectConfig;
```

Agents may already embed tools; the top-level **`tools`** map is for **shared** tools referenced by multiple agents or workflows, and for UI/docs discovery.

---

## `AdlProjectConfig` shape (planned)

```ts
import type { Agent } from "./agent";           // conceptual
import type { Workflow } from "./workflow";
import type { Template } from "./template";
import type { ToolSet } from "ai";

export interface AdlProjectConfig {
  /** Shown in inspection UI and CLI. */
  name: string;

  /** Named agents addressable as config.agents.researcher */
  agents?: Record<string, Agent<unknown, ToolSet>>;

  /** Named workflows addressable as config.workflows.literatureReview */
  workflows?: Record<string, Workflow<unknown, unknown>>;

  /** Named templates for listing / docs; optional if only used inside agents */
  templates?: Record<string, Template<unknown>>;

  /** Shared AI SDK tools (optional registry) */
  tools?: ToolSet;

  /** Optional defaults: message store factory, model router, etc. */
  defaults?: AdlProjectDefaults;
}
```

`defineAgent` / `defineWorkflow` / `template()` return values that satisfy these types. Registry keys are **stable string ids** chosen by the project (object keys), in addition to any `id` field on the definition.

**Validation at load time (v1):**

- `name` required (already enforced).
- Registry values are the correct branded types (lightweight runtime checks or `satisfies` only in userland).
- Duplicate keys impossible in a single object literal; no dynamic key enumeration required.

---

## `loadAdlProject` result

Extend [`LoadedAdlProject`](../packages/runtime/src/project/resolve.ts):

```ts
export interface LoadedAdlProject {
  root: string;
  configPath: string;
  config: AdlProjectConfig;
}
```

Callers use `project.config.workflows?.literatureReview` after load. No separate glob discovery or `workflows/` convention enforced by the framework.

---

## Execution entrypoints

All entrypoints resolve the project the same way: `loadAdlProject({ root })` or walk from cwd ([`findAdlProjectRootFromCwd`](../packages/runtime/src/project/resolve.ts)).

| Entry | Purpose |
|-------|---------|
| **`runWorkflow(project, workflowId, input, options?)`** | Headless run from scripts, tests, server |
| **`adl run <workflowId> [--input …]`** | CLI wrapper; lists workflows from config |
| **`adl dev`** | Inspection UI + project root (existing); lists runs, workflows from config |
| **`adl workflows` / `adl agents`** (optional) | Print registry keys from config |
| **Direct TS** | `import cfg from "./adl.config"` in tests without loader—same types |

### `runWorkflow` (runtime API, planned)

```ts
import { loadAdlProject, runWorkflow } from "@agent-dev-lab/runtime";

const project = await loadAdlProject({ root: process.cwd() });

const result = await runWorkflow(project, "literatureReview", {
  topic: "CRISPR delivery",
});

// options: runId, signal, eventSink, …
```

- Resolves `workflowId` on `project.config.workflows`; throws if missing.
- Creates root [`WorkflowContext`](./workflow-api.md) (`runId`, event log).
- Returns workflow **output** + **run handle** (id, status) for polling.

Workflows not in config can still be run by calling **`workflow.run(input, ctx)`** directly in code (tests, libraries); the registry is for **discovery and CLI/UI**, not a hard execution gate.

### CLI (planned behavior)

```bash
adl run literatureReview --input '{"topic":"…"}'
adl workflows list    # keys from config.workflows
adl agents list       # keys from config.agents
```

Input via JSON flag or stdin; schema validation from workflow `input` Zod when present.

### Inspection UI

- Project **name** from config (today).
- Later: sidebar of **workflows** / **agents** from registries; trigger run for a workflow id; show run tree from step events.

---

## Why registries stay static

| Scenario | Approach |
|----------|----------|
| Different models per environment | `defaults` in config or env in `adl.config.ts`, not runtime registry mutation |
| A/B two workflows | Register both; choose at CLI or `runWorkflow(id)` |
| “Dynamic” agent count | Not supported; use one agent + `context` / tool data instead |
| Monorepo multiple projects | Multiple `adl.config.*` roots; each `loadAdlProject({ root })` |

---

## Relationship to colocation

- **Prompts** can stay next to agents/workflows; only **exports** need to appear in `templates` if you want them listed in UI/docs.
- **Tools** can live in `src/tools/` and be wired into agents; config `tools` re-exports shared ones.
- Nothing prevents a single file from defining and registering a workflow inline in `adl.config.ts` for tiny projects—just import style preference.

---

## Implementation status

| Piece | Status |
|-------|--------|
| `AdlProjectConfig.name` | Implemented |
| Registry fields on config | Not implemented |
| `normalizeConfig` beyond `name` | Not implemented |
| `runWorkflow` | Not implemented |
| CLI `run` / list | Not implemented |
| Playground `adl.config.ts` registries | Not implemented |

---

## v1 checklist

- [ ] Extend `AdlProjectConfig` + `normalizeConfig` (optional registries, passthrough unknown keys or strict)
- [ ] Type exports for `Agent`, `Workflow`, `Template` registries
- [ ] `runWorkflow(project, id, input, options?)`
- [ ] Playground registers sample agent + workflow
- [ ] CLI `adl run` + list commands reading config
- [ ] UI reads workflow/agent keys for navigation (minimal)

---

## Open questions

- Require at least one workflow in config, or allow agent-only projects.
- Whether `templates` registry is v1 or agents-only references suffice.
- Global `defaults.messageStore` vs per-agent override precedence.
- `adl.config.ts` vs `adl.config/index.ts` (support only root filenames already listed in `ADL_CONFIG_FILENAMES`).
