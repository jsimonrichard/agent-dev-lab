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

  /**
   * Push-only observers (stdout, OTEL) — no retrieval. See observability-api.md.
   */
  observers?: {
    workflow?: WorkflowObserver[];
    agent?: AgentObserver[];
  };

  /**
   * Optional persistence + query for UI / resume. Separate from observers.
   */
  stores?: {
    workflow?: WorkflowStore;
  };

  /** Conversation transcripts for agents — separate from workflow store. */
  memory?: {
    store?: MessageStore;
  };
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

## Execution: one primitive, registry is just a `Record`

The registry is not a special runtime type. It is a plain object on config:

```ts
workflows?: Record<string, Workflow<Input, Output>>;
agents?: Record<string, Agent<Context, Tools>>;
// same idea for templates, tools
```

`defineWorkflow` returns a **workflow object** with a `.run()` method. That is the **only** execution API for workflow logic. There is no separate `runWorkflow()` in the public runtime unless we add a one-line helper—and we probably should **not**, to avoid two ways to do the same thing.

### Running a workflow

**By reference** (scripts, tests, nested calls):

```ts
import { literatureReview } from "./src/workflows/literature-review";

const output = await literatureReview.run(
  { topic: "CRISPR delivery" },
  ctx, // WorkflowContext — see below
);
```

**By registry key** (after `loadAdlProject`):

```ts
const project = await loadAdlProject();
const workflow = project.config.workflows?.literatureReview;
if (!workflow) throw new Error("Unknown workflow");

const output = await workflow.run({ topic: "CRISPR delivery" }, ctx);
```

String lookup is just `Record` access. The CLI does exactly that: resolve id → `config.workflows[id].run(input, ctx)`.

### Who creates `WorkflowContext`?

`workflow.run(input, ctx)` needs a context for steps and events. Options:

1. **Caller passes `ctx`** — nested workflow, tests with a fake context.
2. **`workflow.run(input, { project })`** (or `createRunContext(project)`) — runtime builds root `ctx` (`runId`, event sink, defaults from config) when omitted.

So the split is not “`runWorkflow` vs `.run`”; it is **lookup** (config record / CLI id) vs **invoke** (always `.run`).

| Layer | Responsibility |
|-------|----------------|
| **`adl.config.ts`** | `Record` of definitions |
| **`loadAdlProject`** | Load config module |
| **CLI / UI** | List keys; `workflows[id].run(input, { project })` |
| **`workflow.run`** | Execute with step tree; returns **`Promise<Output>`** |

### No `RunHandle` in the core API

Early sketches mentioned a **`RunHandle`** (`id`, `status`, `cancel()`, `subscribe()`). That is **not** a framework primitive for v1.

**Why skip it:**

- **`runId`**, step state, and metadata already live on [`WorkflowContext`](./workflow-api.md) (`ctx.runId`, `ctx.stepId`, …).
- **Output** is the resolved value of `await workflow.run(...)`.
- **Status / history** for the inspection UI come from the **append-only run event log** (keyed by `runId`), not from an in-memory handle object.
- **Cancel** → pass **`AbortSignal`** into `workflow.run` options; workflow and agent code cooperatively check `signal.aborted` (and forward to `generateText` / `streamText`).
- **Subscribe / live updates** → run **event log** + SSE by `runId` ([`streaming-api.md`](./streaming-api.md)); not a core `RunHandle`.

`workflow.run` should be a normal **`Promise<Output>`** (plus typed rejection on failure). Background execution is `void workflow.run(...)` or storing the promise in a variable—standard async TS.

**Optional helpers (non-core):** a small utility in runtime or `apps/web`, e.g. `trackRun({ runId, promise, signal })`, that wires promise settlement to the event log or UI state. Helpful, not required for the execution model.

```ts
// Core (framework)
const output = await literatureReview.run(input, { project, signal });

// Application / web (userland or @agent-dev-lab/web helper)
const runPromise = literatureReview.run(input, { project });
// UI stores runId from createRunContext, subscribes to DB events, awaits runPromise for completion
```

### Entrypoints (no duplicate runtime API)

| Entry | What it does |
|-------|----------------|
| **`workflow.run(input, ctx \| { project })`** | The execution primitive |
| **`adl run <id>`** | Load project → `config.workflows[id].run(...)` |
| **`adl dev` / UI** | Same registry for listing and triggering runs |
| **Import workflow directly** | Skip registry; still use `.run` |

Optional tiny helper (internal or exported, low priority):

```ts
// Equivalent to config.workflows[id].run(input, { project }) — sugar only
function getWorkflow(project: LoadedAdlProject, id: string): Workflow { ... }
```

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
| A/B two workflows | Register both; choose at CLI or `workflows[id].run(...)` |
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
- [ ] `workflow.run(input, ctx | { project })` + `createRunContext(project)`
- [ ] Playground registers sample agent + workflow in config `Record`s
- [ ] CLI `adl run` → lookup `config.workflows[id].run`
- [ ] UI reads workflow/agent keys for navigation (minimal)

---

## Open questions

- Require at least one workflow in config, or allow agent-only projects.
- Whether `templates` registry is v1 or agents-only references suffice.
- Global `defaults.messageStore` vs per-agent override precedence.
- `adl.config.ts` vs `adl.config/index.ts` (support only root filenames already listed in `ADL_CONFIG_FILENAMES`).
