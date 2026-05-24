# ADL runtime API (draft)

How **process-level** services (stores, observers) are wired separately from **`adl.config.ts`**, and how agents/workflows receive them without AsyncLocalStorage.

Related: [`project-api.md`](./project-api.md), [`agent-api.md`](./agent-api.md), [`workflow-api.md`](./workflow-api.md), [`observability-api.md`](./observability-api.md).

---

## Why split runtime from config?

| File                | Role                                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **`adl.config.ts`** | Static **registry** for CLI/UI: `name`, `agents[]`, `workflows[]`, `templates[]`, `tools`, plus **`adl`** reference |
| **`src/adl.ts`**    | **Runtime** construction: `MessageStore`, `WorkflowStore`, observers (may import DB clients)                        |

Registry modules (`src/agents/researcher.ts`) import `adl` from `src/adl.ts` and call `adl.createAgent({ … })`.  
`adl.config.ts` imports those agents and sets `adl` for the CLI — **no import cycle** as long as `adl.ts` does not import `adl.config.ts`.

```ts
// src/adl.ts
import { createAdlRuntime, inMemoryMessageStore } from "@agent-dev-lab/core";

// messageStore defaults to in-memory when omitted: createAdlRuntime()
export const adl = createAdlRuntime({
  messageStore: inMemoryMessageStore(),
  // workflowStore: createSqliteWorkflowStore({ db }),
  observers: { workflows: [stdoutWorkflowObserver], agents: [] },
});
```

```ts
// adl.config.ts
import type { AdlProjectConfig } from "@agent-dev-lab/core";
import { adl } from "./src/adl";
import { researcher } from "./src/agents/researcher";

export default {
  name: "my-research",
  adl,
  agents: [researcher],
  workflows: [
    /* … */
  ],
} satisfies AdlProjectConfig;
```

**Do not** put store construction in `adl.config.ts`. **Do** export full TypeScript agent/workflow/template objects in the registry arrays.

---

## `createAdlRuntime` (bound API)

Drizzle/tRPC-style factory — primary app entrypoint:

```ts
const adl = createAdlRuntime({ messageStore, workflowStore?, observers? });

const researcher = adl.createAgent({
  id: "researcher",
  model,
  instructions,
});

const review = adl.createWorkflow({
  id: "literature-review",
  run: async (input, ctx) => {
    /* `ctx` is provided by the runtime inside workflow.run — not passed by the caller */
  },
});

const handle = review.run(input);
// handle.workflowRunId — subscribe immediately (SSE / WorkflowStore)
await handle.result;
```

`adl.createWorkflow` binds the runtime on the returned workflow; **`workflow.run` creates `WorkflowContext` internally** via `createWorkflowRunContext` (package-internal). Callers never pass `ctx` or `parentCtx`.

`adl.createAgent` / `adl.createWorkflow` delegate to the functional factories with `runtime` injected.

### Overrides (stores + extra observers)

Second argument on `adl.createAgent` / `adl.createWorkflow`:

```ts
const researcher = adl.createAgent(
  { id: "researcher", model, instructions },
  {
    observers: {
      agents: [episodeLogger], // appended to runtime defaults
    },
  },
);
```

- **`messageStore` / `workflowStore`**: replace the runtime default for this agent/workflow/run.
- **`observers.workflows` / `observers.agents`**: **append** to the lists from `createAdlRuntime` (not replace).

`RuntimeServices` uses `WorkflowObservers` and `AgentObservers` (both are observer arrays — same naming pattern).

---

## Functional factories (tests & libraries)

Explicit runtime — no globals, no ALS:

```ts
import { createAgent, createAdlRuntime, inMemoryMessageStore } from "@agent-dev-lab/core";

const runtime = createAdlRuntime({ messageStore: inMemoryMessageStore() });

const agent = createAgent({
  id: "researcher",
  model,
  instructions,
  runtime,
});

await agent.run({
  memoryScope: "test:1",
  user: "Hello",
});
```

Overrides (including extra observers) work the same on `createAgent({ …, runtime, observers: { agents: […] } })`.

---

## No AsyncLocalStorage

Previous sketch used ALS for `RuntimeServices` and `WorkflowContext`. **v1 design removes ALS.**

### Workflow context host

`WorkflowContext` is a **host object**. `step` and `emit` are methods that close over parent services, `workflowRunId`, and step registry:

- Child contexts are built from the **parent host** when `ctx.step("name", async ({ ctx }) => …)` runs.
- **Do not destructure** `ctx` (`const { step } = ctx` breaks method binding).

### Agent ↔ workflow linkage

Pass scope explicitly on `agent.run`:

```ts
await ctx.step("research", async ({ ctx: child }) => {
  await researcher.run({
    memoryScope: child.memoryScope("notes"),
    user: query,
    workflow: {
      workflowRunId: child.workflowRunId,
      stepId: child.stepId,
    },
  });
});
```

Tools: `createToolFromAgent(…, { mapRun: (args, { ctx }) => ({ …, workflow: { … } }) })`.

---

## `workflow.run`

```ts
const handle = review.run(input);
handle.workflowRunId; // for UI / SSE before result completes
await handle.result;
```

- **Public API:** `run(input)` only — no `WorkflowContext` argument.
- **Author API:** `createWorkflow({ run: async (input, ctx) => … })` — `ctx` is supplied by the runtime when the bound workflow runs.
- **No `{ project }`** on the execution path.
- CLI: `loadAdlProject()` → `getWorkflow(id)` → `workflow.run(input)` using `config.adl`-bound workflows.

### Nested / subworkflows (package-internal)

Subworkflows and `createToolFromWorkflow` use **`NestedWorkflowRunOptions`** (`{ parentCtx }`) inside the core library — never exposed on public `Workflow.run`.

---

## Implementation status

| Piece                                   | Status                             |
| --------------------------------------- | ---------------------------------- |
| `createAdlRuntime` / `AdlRuntime` types | ✅ API draft                       |
| `createAgent({ …, runtime })`           | ✅ signature; run/stream stub      |
| `createWorkflow({ …, runtime })`        | ✅ signature; run stub             |
| `adl` on `AdlProjectConfig`             | ✅ type                            |
| `src/adl.ts` convention                 | ✅ documented + playground example |
| Context host (`step` without ALS)       | 🔲 implementation (follow-up PR)   |
| Remove ALS from implementation PR #9    | 🔲 rebase after merge              |

---

## Migration from config `stores` / `observers`

Remove from `AdlProjectConfig` (v1 API PR). Move to `src/adl.ts`:

```diff
- stores: { workflows, memory },
- observers: { workflows, agents },
+ // in src/adl.ts
+ export const adl = createAdlRuntime({ messageStore, workflowStore, observers });
```

Config keeps `adl` reference for CLI execution.
