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
export const adl = createAdlRuntime({ stores: { message: inMemoryMessageStore() } });

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

Extend [`LoadedAdlProject`](../packages/core/src/project/resolve.ts):

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

const handle = literatureReview.run({ topic: "CRISPR delivery" });
const output = await handle.result;
```

**By id** (after `loadAdlProject`):

```ts
const project = await loadAdlProject();
const workflow = project.getWorkflow("literature-review");
if (!workflow) throw new Error("Unknown workflow");

const handle = workflow.run({ topic: "CRISPR delivery" });
const output = await handle.result;
```

The CLI resolves the string argument → `getWorkflow(id)` → `.run(...)`. The id is whatever you set on `createWorkflow({ id: "literature-review", ... })`, not a separate config key.

### Who creates `WorkflowContext`?

`workflow.run(input)` creates run context internally (workflow is bound to `adl` at factory time). The handle exposes **`workflowRunId`** immediately for SSE / store subscription (see [`runtime-api.md`](./runtime-api.md)).

So the split is not “`runWorkflow` vs `.run`”; it is **lookup by `id`** (CLI / `getWorkflow`) vs **invoke** (always `.run`).

| Layer                | Responsibility                                                  |
| -------------------- | --------------------------------------------------------------- |
| **`adl.config.ts`**  | Arrays of definitions (`workflows`, `agents`)                   |
| **`loadAdlProject`** | Load config + index by `id`                                     |
| **CLI / UI**         | List ids; `getWorkflow(id).run(input)` → `handle.workflowRunId` |
| **`workflow.run`**   | Execute with step tree; returns **`WorkflowRunHandle`**         |

### `WorkflowRunHandle` (minimal)

`workflow.run(input)` returns a small handle — not a rich in-memory run controller:

- **`workflowRunId`** — available immediately for SSE / `WorkflowStore` subscription ([`streaming-api.md`](./streaming-api.md)).
- **`result`** — `Promise<Output>` (typed rejection on failure).
- **`cancel()`** — cooperative cancellation (implementation forwards `AbortSignal` internally).

Authors still receive [`WorkflowContext`](./workflow-api.md) inside `createWorkflow({ run: async (input, ctx) => … })`; callers never pass `ctx` or `parentCtx`.

Background execution: `void workflow.run(input)` or keep the handle and await `result` later.

**Optional helpers (non-core):** utilities in runtime or `apps/web` (e.g. `trackRun({ workflowRunId, promise })`) for UI state — not required for the execution model.

```ts
const handle = literatureReview.run(input);
// UI: subscribe by handle.workflowRunId before result settles
const output = await handle.result;
```

### Entrypoints (no duplicate runtime API)

| Entry                        | What it does                              |
| ---------------------------- | ----------------------------------------- |
| **`workflow.run(input)`**    | The execution primitive                   |
| **`adl run <id>`**           | Load project → `getWorkflow(id).run(...)` |
| **`adl dev` / UI**           | `listWorkflowIds()` + trigger by `id`     |
| **Import workflow directly** | Skip registry; still use `.run`           |

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
- [ ] `createAdlRuntime` + `workflow.run(input)` + `config.adl` on project
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
