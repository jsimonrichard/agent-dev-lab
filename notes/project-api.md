# Project config & execution entrypoints (draft)

How an ADL **project** declares agents, workflows, templates, and tools, and how the CLI / UI / scripts **run** them.

**Status:** Design for v1 planning. Registry + `adl` field are typed in [`packages/core/src/project/config.ts`](../packages/core/src/project/config.ts); execution is incremental.

Related: [`runtime-api.md`](./runtime-api.md).

Related: [`agent-api.md`](./agent-api.md), [`workflow-api.md`](./workflow-api.md), [`message-store.md`](./message-store.md).

---

## Design decision: registry in `adl.config.*`

Expose **workflows, agents, templates, tools** (and optional defaults) from the project config module so everything else stays flexible:

- Implementations live in arbitrary paths (`src/workflows/…`, `src/agents/…`, colocated prompts).
- Only **`adl.config.ts`** (or `.mts` / `.js` / `.mjs`) is the **discovery surface** for the CLI, inspection UI, and `loadAdlProject()`.
- The config file **imports** definitions and lists them in **`workflows`** / **`agents`** arrays.
- Each definition carries its own **`id`** string — no parallel object keys to keep in sync.

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
// src/adl.ts — see runtime-api.md
import { createAdlRuntime, inMemoryMessageStore } from "@agent-dev-lab/core";
export const adl = createAdlRuntime({ messageStore: inMemoryMessageStore() });

// adl.config.ts
import type { AdlProjectConfig } from "@agent-dev-lab/core";
import { adl } from "./src/adl";
import { researcher, writer } from "./src/agents/index";
import { literatureReview, quickSummary } from "./src/workflows/index";

export default {
  name: "my-research",
  adl,
  agents: [researcher, writer],
  workflows: [literatureReview, quickSummary],
} satisfies AdlProjectConfig;
```

Agents may already embed tools; the top-level **`tools`** map is for **shared** tools referenced by multiple agents or workflows, and for UI/docs discovery.

---

## `AdlProjectConfig` shape (planned)

```ts
import type { Agent } from "./agent"; // conceptual
import type { Workflow } from "./workflow";
import type { Template } from "./template";
import type { ToolSet } from "ai";

export interface AdlProjectConfig {
  /** Shown in inspection UI and CLI. */
  name: string;

  /** Agents — `id` on each `createAgent` is the sole registry key */
  agents?: Agent<unknown, ToolSet>[];

  /** Workflows — `id` on each `createWorkflow` is the sole registry key */
  workflows?: Workflow<unknown, unknown>[];

  /**
   * Templates — registry `name` is the template file basename (see templates-api.md).
   * e.g. `./prompts/find-papers.md` → `getTemplate("find-papers")`
   */
  templates?: Template<unknown>[];

  /** Shared AI SDK tools (optional registry) */
  tools?: ToolSet;

  /** Optional defaults: model router, etc. */
  defaults?: AdlProjectDefaults;

  /**
   * Process runtime for CLI execution (`src/adl.ts`). Stores/observers live there —
   * not on this config object. See runtime-api.md.
   */
  adl?: AdlRuntime;

  /**
   * Future — how human approval requests are delivered (UI, CLI, webhook).
   * Used by AI SDK tool approval hooks and ctx.requestApproval. See future-extensions.md.
   */
  approvals?: {
    dispatcher: ApprovalDispatcher;
  };
}
```

```ts
/** Future — not v1 */
interface ApprovalDispatcher {
  request(req: ApprovalRequest): Promise<ApprovalDecision>;
}

type ApprovalRequest = {
  runId: string;
  stepId?: string;
  kind: "tool" | "step";
  message: string;
  metadata?: Record<string, unknown>;
};

type ApprovalDecision = { approved: boolean; reason?: string };
```

`createAgent` / `createWorkflow` must include a non-empty string **`id`**. **`createTemplate`** uses **`name`** from the template **filename** (no separate id field) — see [`templates-api.md`](./templates-api.md).

**Validation at load time (v1):**

- `name` required (already enforced).
- Each workflow/agent: unique **`id`** (throw on duplicate).
- Each template in `templates[]`: unique **`name`** from filename (throw on duplicate).
- Values are the correct branded types (lightweight runtime checks or `satisfies` in userland).

---

## `loadAdlProject` result

Extend [`LoadedAdlProject`](../packages/runtime/src/project/resolve.ts):

```ts
export interface LoadedAdlProject {
  root: string;
  configPath: string;
  config: AdlProjectConfig;

  /** Resolve by `workflow.id` — built when config loads */
  getWorkflow(id: string): Workflow<unknown, unknown> | undefined;
  getAgent(id: string): Agent<unknown, ToolSet> | undefined;
  listWorkflowIds(): string[];
  listAgentIds(): string[];
  getTemplate(name: string): Template<unknown> | undefined;
  listTemplateNames(): string[];
}
```

Callers use **`project.getWorkflow("literature-review")`** (or import the definition directly). No glob discovery convention enforced by the framework.

---

## Execution: one primitive, registry is a list + `id`

Registries are **arrays** at config time; the runtime indexes by **`definition.id`**:

`createWorkflow` returns a **workflow object** with a `.run()` method. That is the **only** execution API for workflow logic. There is no separate `runWorkflow()` in the public runtime unless we add a one-line helper—and we probably should **not**, to avoid two ways to do the same thing.

### Running a workflow

**By reference** (scripts, tests, nested calls):

```ts
import { literatureReview } from "./src/workflows/literature-review";

const output = await literatureReview.run(
  { topic: "CRISPR delivery" },
  ctx, // WorkflowContext — see below
);
```

**By id** (after `loadAdlProject`):

```ts
const project = await loadAdlProject();
const workflow = project.getWorkflow("literature-review");
if (!workflow) throw new Error("Unknown workflow");

const output = await workflow.run({ topic: "CRISPR delivery" }, ctx);
```

The CLI resolves the string argument → `getWorkflow(id)` → `.run(...)`. The id is whatever you set on `createWorkflow({ id: "literature-review", ... })`, not a separate config key.

### Who creates `WorkflowContext`?

`workflow.run(input, ctx)` needs a context for steps and events. Options:

1. **Caller passes `ctx`** — nested workflow, tests with a fake context.
2. **`workflow.run(input, ctx)`** — `ctx` from `project.config.adl.createWorkflowRunContext()` (see [`runtime-api.md`](./runtime-api.md)).

So the split is not “`runWorkflow` vs `.run`”; it is **lookup by `id`** (CLI / `getWorkflow`) vs **invoke** (always `.run`).

| Layer                | Responsibility                                        |
| -------------------- | ----------------------------------------------------- |
| **`adl.config.ts`**  | Arrays of definitions (`workflows`, `agents`)         |
| **`loadAdlProject`** | Load config + index by `id`                           |
| **CLI / UI**         | List ids; `getWorkflow(id).run(input, ctx)`           |
| **`workflow.run`**   | Execute with step tree; returns **`Promise<Output>`** |

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

| Entry                                         | What it does                              |
| --------------------------------------------- | ----------------------------------------- |
| **`workflow.run(input, ctx \| { project })`** | The execution primitive                   |
| **`adl run <id>`**                            | Load project → `getWorkflow(id).run(...)` |
| **`adl dev` / UI**                            | `listWorkflowIds()` + trigger by `id`     |
| **Import workflow directly**                  | Skip registry; still use `.run`           |

Optional tiny helper (internal or exported, low priority):

`getWorkflow` / `getAgent` on `LoadedAdlProject` are the supported lookup API (may be thin wrappers over an internal `Map`).

### CLI (planned behavior)

```bash
adl run literature-review --input '{"topic":"…"}'
adl workflows list    # ids from config.workflows[].id
adl agents list       # ids from config.agents[].id
```

Input via JSON flag or stdin; schema validation from workflow `input` Zod when present.

### Inspection UI

- Project **name** from config (today).
- Later: sidebar of **workflows** / **agents** from registries; trigger run for a workflow id; show run tree from step events.

---

## Why registries stay static

| Scenario                         | Approach                                                                      |
| -------------------------------- | ----------------------------------------------------------------------------- |
| Different models per environment | `defaults` in config or env in `adl.config.ts`, not runtime registry mutation |
| A/B two workflows                | List both; choose at CLI or `getWorkflow(id).run(...)`                        |
| “Dynamic” agent count            | Not supported; use one agent + `context` / tool data instead                  |
| Monorepo multiple projects       | Multiple `adl.config.*` roots; each `loadAdlProject({ root })`                |

---

## Relationship to colocation

- **Prompts** can stay next to agents/workflows; only **exports** need to appear in `templates` if you want them listed in UI/docs.
- **Tools** can live in `src/tools/` and be wired into agents; config `tools` re-exports shared ones.
- Nothing prevents a single file from defining and registering a workflow inline in `adl.config.ts` for tiny projects—just import style preference.

---

## Implementation status

| Piece                                 | Status          |
| ------------------------------------- | --------------- |
| `AdlProjectConfig.name`               | Implemented     |
| Registry fields on config             | Not implemented |
| `normalizeConfig` beyond `name`       | Not implemented |
| `runWorkflow`                         | Not implemented |
| CLI `run` / list                      | Not implemented |
| Playground `adl.config.ts` registries | Not implemented |

---

## v1 checklist

- [ ] Extend `AdlProjectConfig` + `normalizeConfig` (optional registries, passthrough unknown keys or strict)
- [ ] Type exports for `Agent`, `Workflow`, `Template` registries
- [ ] `createAdlRuntime` + `workflow.run(input, ctx)` + `config.adl` on project
- [ ] Playground lists sample agent + workflow in config arrays
- [ ] `loadAdlProject` builds id index; duplicate id errors
- [ ] CLI `adl run` → `getWorkflow(id).run`
- [ ] UI lists ids from `listWorkflowIds()` / `listAgentIds()`

---

## Open questions

- Require at least one workflow in config, or allow agent-only projects.
- `adl templates list` / preview by `template.name` (post-v1 UI).
- Global `defaults.messageStore` vs per-agent override precedence.
- `adl.config.ts` vs `adl.config/index.ts` (support only root filenames already listed in `ADL_CONFIG_FILENAMES`).
