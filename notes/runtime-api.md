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

export const adl = createAdlRuntime({
  messageStore: inMemoryMessageStore(),
  // workflowStore: createSqliteWorkflowStore({ db }),
  observers: { workflows: [], agents: [] },
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
  run: async (input, ctx) => { /* … */ },
});

const ctx = adl.createWorkflowRunContext();
const handle = review.run(input, ctx);
```

`adl.createAgent` / `adl.createWorkflow` delegate to the functional factories with `runtime` injected.

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

Optional per-agent overrides: second argument on `adl.createAgent(def, { messageStore })` or merged on `createAgent({ …, runtime, messageStore })`.

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
workflow.run(input, ctx); // ctx from adl.createWorkflowRunContext()
```

- **`WorkflowRunOptions`** is **`WorkflowContext`** only (no `{ project }` on the execution path).
- CLI: `loadAdlProject()` → `project.config.adl` → `adl.createWorkflowRunContext()` → `workflow.run`.

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
