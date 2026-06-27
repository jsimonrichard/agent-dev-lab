---
title: Runtime
description: createAdlRuntime, factory binding, and workflow context propagation.
---

The ADL **runtime** wires process-level services: message and workflow stores, observers, template engine, and workflow context scope.

Construct the runtime in **`src/adl.ts`** (recommended) and set `adl` on `adl.config.ts`. Registry code should `import { adl } from "#adl"` — see [Project setup](/guides/project-setup/) for the tsconfig alias. Tooling loads the runtime via `loadAdlProject().getAdl()` — not by importing `src/adl.ts` directly.

## createAdlRuntime

Drizzle/tRPC-style factory — primary app entrypoint:

```ts
import { createAdlRuntime, inMemoryMessageStore, inMemoryWorkflowStore } from "@agent-dev-lab/core";

const adl = createAdlRuntime({
  stores: {
    message: inMemoryMessageStore(),
    workflow: inMemoryWorkflowStore(),
  },
  observers: { workflows: [], agents: [] },
});

const researcher = adl.createAgent({
  id: "researcher",
  model,
  instructions,
});

const review = adl.createWorkflow({
  id: "literature-review",
  run: async (input, ctx) => {
    /* ctx is supplied by the runtime inside workflow.run */
  },
});

const handle = review.run(input);
handle.workflowRunId; // subscribe immediately (WorkflowStore / future SSE)
await handle.result;
```

`adl.createAgent` / `adl.createWorkflow` bind the runtime automatically — use these in project code.

### Per-definition overrides

Second argument on `adl.createAgent` / `adl.createWorkflow`:

```ts
const researcher = adl.createAgent(
  { id: "researcher", model, instructions },
  {
    observers: { agents: [episodeLogger] }, // appended to runtime defaults
    stores: { message: customStore }, // replaces default for this agent
  },
);
```

- **`stores.message` / `stores.workflow`**: replace the runtime default for this agent/workflow/run.
- **`observers.workflows` / `observers.agents`**: **append** to lists from `createAdlRuntime` (not replace).

### Functional factories (tests only)

Project code should use **`adl.createAgent`**, **`adl.createWorkflow`**, and **`adl.createTemplate`**. The package also exports `createAgent(runtime, …)`, `createWorkflow(runtime, …)`, and `createTemplate(runtime, …)` for unit tests and libraries that need an explicit runtime handle without a project `adl` module. Same behavior — prefer the bound methods in application code.

## AsyncLocalStorage: workflow context only

ALS is **not** used for runtime services (stores, observers) — those are passed explicitly.

ALS **is** used for **workflow context propagation**: when `agent.run` / `agent.stream` is called inside a workflow body or step, the active `WorkflowContext` is available so agents attach to the correct `workflowRunId` / `stepId` without manual wiring.

Callers can still pass `workflow: { workflowRunId, stepId }` explicitly — that takes priority over ALS.

### Workflow context host

`WorkflowContext` is a **host object**. `step` and `emit` close over parent services, `workflowRunId`, and step registry.

- Child contexts are built from the **parent host** when `ctx.step("name", async ({ ctx }) => …)` runs.
- **Do not destructure** `ctx` (`const { step } = ctx` breaks method binding).

Inside a workflow step:

```ts
await ctx.step("research", async ({ ctx: child }) => {
  await researcher.run({
    memoryScope: child.memoryScope("notes"),
    user: query,
  });
});
```

Tools created via `adl.createToolFromAgent` / `adl.createToolFromWorkflow` **require** ALS — they must be called from within a workflow run.

## workflow.run

```ts
const handle = review.run(input);
handle.workflowRunId;
await handle.result;
```

- **Public API:** `run(input)` for root runs (CLI, UI).
- **Author API:** inside a workflow, `otherWorkflow.run(input)` nests via ALS.
- **No `{ project }`** on the execution path.

Nested runs can pass `parentCtx` explicitly:

```ts
await ctx.step("search", async ({ ctx: child }) => {
  const result = await searchPapers.run({ topic }, { parentCtx: child }).result;
});
```

## Defaults

When stores are omitted, `createAdlRuntime` defaults to in-memory implementations for both `message` and `workflow`. SQLite-backed stores are planned in `@agent-dev-lab/common` but not shipped yet.
