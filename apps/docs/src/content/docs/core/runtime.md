---
title: Runtime
description: createAdlRuntime, factory binding, and workflow context propagation.
---

The ADL **runtime** wires process-level services: message and workflow stores, observers, template engine, and workflow context scope.

Construct the runtime in **`src/adl.ts`** (recommended) and set `adl` on `adl.config.ts`. Registry code should `import { adl } from "#adl"` — see [Project setup](/guides/project-setup/) for the tsconfig alias. Tooling loads the runtime via `loadAdlProject().getAdl()` — not by importing `src/adl.ts` directly.

## createAdlRuntime

Drizzle/tRPC-style factory — primary app entrypoint. By default it loads `.env*` from `process.cwd()` (pass `loadEnv: false` to skip, or `loadEnv: { root }` for an explicit project root). If modules read `process.env` at import time (for example `ADL_MODEL` in `src/model.ts`), call `loadAdlEnv({ root })` before that read — ESM evaluates imports before `createAdlRuntime` runs.

```ts
import { createAdlRuntime, sqliteMessageStore, sqliteWorkflowStore } from "@agent-dev-lab/core";
import { openai } from "@ai-sdk/openai";

const adl = createAdlRuntime({
  defaults: { model: openai("gpt-4o-mini") },
  stores: {
    message: sqliteMessageStore(),
    workflow: sqliteWorkflowStore(),
  },
  observers: { workflows: [], agents: [] },
});
```
`adl.createAgent` / `adl.createWorkflow` bind the runtime automatically — use these in project code.

### Per-definition overrides

Second argument on `adl.createAgent` / `adl.createWorkflow`:

```ts
import { inMemoryMessageStore, type AgentObserver, type MessageStore } from "@agent-dev-lab/core";
import { openai } from "@ai-sdk/openai";

// continues the createAdlRuntime example above
const episodeLogger: AgentObserver = {
  onEvent: (event) => console.log(event.type, event),
};

const customStore: MessageStore = inMemoryMessageStore();

const researcher = adl.createAgent(
  { id: "researcher", model: openai("gpt-4o"), systemPrompt: "You are a research assistant." },
  {
    observers: { agents: [episodeLogger] }, // appended to runtime defaults
    stores: { message: customStore }, // replaces default for this agent
  },
);
```

- **`stores.message` / `stores.workflow`**: replace the runtime default for this agent/workflow/run.
- **`observers.workflows` / `observers.agents`**: **append** to lists from `createAdlRuntime` (not replace).

## EventLog

[`inMemoryEventLog()`](/api/functions/inmemoryeventlog/) is a ring-buffer [`EventLog`](/api/interfaces/eventlog/) that also implements `WorkflowObserver` and `AgentObserver`. Register the **same instance** on both lists so workflow and agent events share one `logSeq` (process-wide, unlike per-run `RunEvent.seq`):

```ts
import { createAdlRuntime, inMemoryEventLog } from "@agent-dev-lab/core";

const eventLog = inMemoryEventLog(); // default cap 10_000

const adl = createAdlRuntime({
  observers: {
    workflows: [eventLog],
    agents: [eventLog],
  },
});
```

`eventLog.list({ afterSeq, type, limit })` reads the buffer. `waitForAppend(afterSeq, signal)` resolves when a later event arrives (or the signal aborts) so an SSE tail does not miss events between `list` and wait. `clear()` empties the buffer.

The inspection UI attaches its own process singleton this way and hydrates an empty log from [`WorkflowStore`](/api/interfaces/workflowstore/) on startup. A SQLite `EventLog` is not implemented yet.

Observer lists are **not** pinned across [`watchAdlProject`](/core/project/) reloads — late-attached observers (including the inspector log) must be pushed again onto the new arrays.

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

Inside a workflow step (`researcher` defined in registry; `query` from workflow input):

```ts
await ctx.step("research", async ({ ctx: child }) => {
  await researcher.run({
    memoryScope: child.memoryScopeWithSuffix("notes"),
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
- **Author API:** inside a workflow, `otherWorkflow.run(input)` **nests** via ALS (shared `workflowRunId`). Pass `{ isolated: true }` for a separate persisted run that is not included in the parent's tree — see [Isolated runs](/core/workflows/#isolated-runs).
- **No `{ project }`** on the execution path.

Nested runs can pass `parentCtx` explicitly:

```ts
// inside literature-review run; searchPapers imported from workflows/search-papers.ts
await ctx.step("search", async ({ ctx: child }) => {
  const result = await searchPapers.run({ topic: input.topic }, { parentCtx: child }).result;
});
```

## Defaults

When stores are omitted, `createAdlRuntime` uses in-memory `message` and `workflow` stores (fine for tests). For durable runs, pass `sqliteMessageStore()` / `sqliteWorkflowStore()` (default file `.data/agent-dev-lab.sqlite`, overridable with `ADL_SQLITE_PATH`).

`defaults.model` and `tools` on `createAdlRuntime` apply to every agent that omits those fields (agent values win). Set these on the runtime — not on `adl.config` — because agents are created before the config object finishes loading.

## Testing

```ts
import { createTestRuntime } from "@agent-dev-lab/core";

const adl = createTestRuntime(); // in-memory stores
```

Pass `defaults.model` (or a mock `LanguageModel`) when the test constructs agents.

## Tracing

`RunRecorder` already mirrors run events onto the active OpenTelemetry span. Agent episodes also forward AI SDK `experimental_telemetry` on `streamText` so model and tool spans nest under the agent span. Disable with `createAdlRuntime({ telemetry: { isEnabled: false } })`. Install an OTel SDK exporter in the application; ADL does not ship a parallel tracing API. See `notes/tracing.md`.
