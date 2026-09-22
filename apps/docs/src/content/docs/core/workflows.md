---
title: Workflows
description: adl.createWorkflow, ctx.step, nesting, keys, step caching, and run retry.
---

Workflows are pure TypeScript orchestration: `if` / `for` / `try` / `await` / `Promise.all` — no graph DSL. **Steps** mark observable, retryable units whose outputs are cached on [`WorkflowStore`](/api/interfaces/workflowstore/); nested workflows provide typed, reusable modules.

## Two Composition Primitives

|              | **`ctx.step`**                                                   | **Nested workflow**                         |
| ------------ | ---------------------------------------------------------------- | ------------------------------------------- |
| **Purpose**  | Observability span + **retry boundary** (cached step output)     | Reusable unit with typed **input → output** |
| **Contract** | Closure captures anything; return value becomes persisted output | Optional Zod `inputSchema` / `outputSchema` |
| **Reuse**    | Extract plain TS functions                                       | `otherWorkflow.run(input)`                  |
| **Tracing**  | Always creates a step node                                       | Inner workflow defines its own steps        |
| **Best for** | Side effects, agent calls, or work you may skip on retry         | “Named, testable sub-process”               |

Typically **`step` around a nested `run`** when you want the sub-workflow visible as one waterfall bar:

```ts
// workflows/search-papers.ts
import { z } from "zod";

import { adl } from "#adl";

export const searchPapers = adl.createWorkflow({
  id: "search-papers",
  inputSchema: z.object({ topic: z.string() }),
  outputSchema: z.object({ papers: z.array(z.string()) }),
  async run(input, ctx) {
    return { papers: [] };
  },
});
```

```ts
// inside another workflow's run(input, ctx):
await ctx.step("search", async ({ ctx: child }) => {
  const { papers } = await searchPapers.run({ topic: input.topic }).result;
  return papers;
});
```

Calling `searchPapers.run` **without** `step` is valid when you do not need an extra span.

To expose an agent as a workflow that takes a **string** user message, use `adl.createWorkflowFromAgent(agent)` (optional `{ id }`; default `${agent.id}-as-workflow`). That is the workflow-shaped counterpart of `adl agent run`.

## Nested and Isolated Runs

By default, `otherWorkflow.run(input)` **nests**: it joins the active parent via ALS (or explicit `parentCtx`), allocates a **new** `workflowRunId`, and records `parentWorkflowRunId` on the child (plus `parentStepId` when the call happens inside an active `ctx.step`). The child's steps and agents bind to the child run (own step cache and event stream). Abort is linked to the parent.

`{ isolated: true }` starts an **unlinked** run (no parent pointer):

|                 | Nested (default)                                                                                                | `{ isolated: true }`                                         |
| --------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Parent          | Joins ALS / `parentCtx`                                                                                         | Ignores parent                                               |
| `workflowRunId` | New id                                                                                                          | New id                                                       |
| Parent link     | `parentWorkflowRunId` = parent's id                                                                             | `null`                                                       |
| Step link       | `parentStepId` = calling step, or `null` at workflow root                                                       | `null`                                                       |
| Persistence     | Own row on [`WorkflowStore`](/api/interfaces/workflowstore/)                                                    | Own row on [`WorkflowStore`](/api/interfaces/workflowstore/) |
| Inspector       | Inline under the calling step (or under the workflow row when called at root); expand to load the child's steps | Own tree; not in another run's child list                    |

Isolated runs are always persisted, but whether they appear in the inspection UI is determined by the project config. To leave a workflow out of the UI, do not include it in the project config's workflow array. Non-root (nested) child runs can be hidden from the main run list (roots-only) via the Non-Root toggle. Opening a non-root run page still shows a parent back-link.

```ts
// Inside a parent workflow (or an agent episode that happens to be in one):
await helper.run(input, { isolated: true }).result;
```

Conversation [`titleWorkflow`](/core/agents/#conversation-titles) uses this so naming a chat does not inject steps into another workflow's tree.

## Input and Output Types

Zod `inputSchema` / `outputSchema` on `createWorkflow` both **validate at runtime** and **infer TypeScript types**. Zod is optional. Pin types with generics (or by annotating `run`) when you do not want a runtime schema:

```ts
type SearchInput = { topic: string };
type SearchOutput = { papers: string[] };

export const searchPapers = adl.createWorkflow<SearchInput, SearchOutput>({
  id: "search-papers",
  async run(input, ctx) {
    return { papers: [] };
  },
});
```

`workflow.run` then type-checks callers against `SearchInput` and `handle.result` is `Promise<SearchOutput>`. Add Zod later if you want parse/defaults without changing those types.

## Step Callback Shape

```ts
await ctx.step("outline", async ({ ctx }) => {
  await ctx.step("draft", async ({ ctx }) => {
    // ...
  });
});
```

Nested workflow `run(input)` accepts the same child `ctx` via ALS when called from inside a parent.

## Step Identity

| Field              | Meaning                                         |
| ------------------ | ----------------------------------------------- |
| **`stepId`**       | Unique per invocation (UUID)                    |
| **`name`**         | First argument to `step("…", …)`                |
| **`key`**          | Optional disambiguator (React-style)            |
| **`stepPath`**     | Stable logical path from `(name, key)` ancestry |
| **`parentStepId`** | Parent invocation, or `null` at run root        |

Path segments: `name` when `key` is omitted, or `` `${name}:${key}` `` when keyed.

## Step Keys

Under a given parent, **`(name, key)`** identifies a logical step slot for the whole run:

| Rule                                       | Behavior                               |
| ------------------------------------------ | -------------------------------------- |
| First `step("foo", …)` with no `key`       | Allowed — default slot for that name   |
| Second+ `step("foo", …)` under same parent | **`key` required** — throws if omitted |
| Duplicate `(name, key)`                    | **Throw**                              |
| Parallel same `name`                       | **Distinct `key`s required**           |

```ts
for (const topic of topics) {
  await ctx.step(
    "search",
    async ({ ctx }) => {
      /* ... */
    },
    { key: topic },
  );
}
```

## Resumability

**Resume** starts a **new attempt** after a failure. **Retry from a step** uses the same mechanism: you choose the step, and ADL starts a new attempt from there. Still-valid work is **replayed** by returning stored step outputs through `ctx.step` (no callback). Work that must run again gets **new run/step IDs** and fresh events. The prior attempt forest stays immutable. That uses [`WorkflowStore`](/api/interfaces/workflowstore/) (`seedRetryAttempt`). Inspection replay also reads this store; it does not re-execute the workflow.

[`MessageStore`](/api/interfaces/messagestore/) holds the transcript the model sees. Same `memoryScope` on a later `agent.run` is ordinary **conversation memory** (load / append / save). See [Agents — Calling an Agent](/core/agents/#calling-an-agent). A step records each scope the runtime message store loads, saves, copies, or deletes. When that step is **skipped** on a new attempt, a `${workflowRunId}:${suffix}` transcript (`memoryScopeWithSuffix`) is copied onto this attempt's scope. A scope id the workflow chose itself stays on that same row.

### Nesting and attempt forests

Each `workflow.run()` gets its own `workflowRunId`. Nested (non-isolated) invocations record `parentWorkflowRunId` and `parentStepId` (the parent `ctx.stepId` at nest time, or `null` at workflow root). `{ isolated: true }` detaches — no parent link — and stays **out of** attempt cascade (e.g. `titleWorkflow`). Re-entering a path that calls an isolated helper again always starts a fresh run.

### Steps Are Atomic Retry Units

A **`ctx.step` callback is one atomic unit** from the framework’s point of view. On a new attempt, ADL can only:

- **Skip** the step entirely — return a stored output without running the callback, or
- **Re-run** the whole callback from the first line.

There is no safe way to resume “halfway through” a step body (custom logic → `agent.run` → more logic) without re-executing the preamble. Put **non-idempotent or expensive work in its own step** so retry can skip it via cached output.

```ts
await ctx.step("search", async ({ ctx }) => {
  const files = await listFiles(); // runs again unless this step is skipped
  const prompt = buildPrompt(files);
  const out = await agent.run({ memoryScope: ctx.memoryScopeWithSuffix("search"), user: prompt });
  await uploadSummary(out); // runs again on step retry — keep uploads in a separate step if needed
  return out;
});
```

Code **between** steps (top-level `run` body, loops, variables in closure) is **not** persisted. Only step **return values** are stored. Design workflows so retry-relevant state flows through step outputs or explicit inputs, not mutable closure variables alone. Steps are **pure by default**: do not mutate captured closures; anything a later step needs must appear in an earlier step’s output (or run input).

### Path-stable step slots

Step output cache keys are the logical **`path`** segments (`name` or `name:key`), not ephemeral parent step UUIDs. Re-entering an ancestor can still skip prefix siblings under that ancestor.

### Attempt lineage (retry from a step)

```ts
const first = workflow.run(input);
await first.result.catch(() => {});

const failed = await store.getLatestEvent({ workflowRunId: first.workflowRunId }, "step_failed");
const attempt = await store.seedRetryAttempt({
  fromWorkflowRunId: first.workflowRunId,
  fromStepId: failed!.stepId,
});

const retry = workflow.run(input, {
  workflowRunId: attempt.newRootRunId,
  retryAttempt: attempt,
});
await retry.result;
```

Seeding copies still-valid run/step **projections** with `replayOf*` links and seeds the new attempt’s skip cache. The target step, its descendants, path/`parentWorkflowRunId` ancestors, time-subsequent steps (`step_started.at` > `T_end`), and `{ pure: false }` steps re-execute. Unknown `fromStepId` throws.

Same-`workflowRunId` re-entry (without seeding) still skips via the path-stable cache when outputs remain — useful for simple mid-run retries, but superseded for forest retry by attempt lineage.

The inspection UI exposes this as **Retry** (run header and the workflow-row menu) and **Retry from here** (step menu and step inspector). Retry is refused while any run in the attempt forest is still running. Other hosts call `seedRetryAttempt` the same way.

### Pure vs force

| Option        | Scope                | Behavior                                                                         |
| ------------- | -------------------- | -------------------------------------------------------------------------------- |
| `force: true` | This call only       | Bypass skip cache for this invocation                                            |
| `pure: false` | Declared on the step | On every **new attempt** that reaches this path: always re-exec; never skip/copy |

```ts
await ctx.step(
  "upload",
  async () => {
    /* side effect */
  },
  { pure: false },
);

await ctx.step(
  "search",
  async ({ ctx }) => {
    /* ... */
  },
  { force: true },
);
```

### Agents on Retry

Step skip **does not** skip an LLM call by itself — it skips the **entire step callback**. If the step runs, `agent.run` executes again and typically **loads** the existing transcript for its `memoryScope` ([Agents](/core/agents/#memoryscope)). A skipped step does not run that load. Its `memoryScopeWithSuffix` transcript is copied onto the new attempt first, so a later step using the same suffix still sees it. A step that re-executes does not receive that copy; it starts on the new scope.

On step retry, choose a policy explicitly:

| Policy             | Behavior                                                                   |
| ------------------ | -------------------------------------------------------------------------- |
| **Continue scope** | Same `memoryScope`; model sees prior attempt                               |
| **Fork scope**     | New suffix per attempt, e.g. `ctx.memoryScopeWithSuffix("search:retry-1")` |
| **Clear scope**    | Wipe store for that scope before `agent.run`                               |

### Not in v1

| Capability                              | Status                                                       |
| --------------------------------------- | ------------------------------------------------------------ |
| Auto resume mid-closure (TS variables)  | Not supported — use step outputs + skip                      |
| Checkpoints (`ctx.checkpoint`)          | Deferred                                                     |
| Agent episode cache (`cacheable: true`) | Deferred                                                     |
| Mid-stream token resume                 | Not a goal                                                   |
| Durable crash resume without re-entry   | SQLite stores persist I/O; mid-closure resume still deferred |

## WorkflowContext

```ts
type WorkflowContext = {
  readonly workflowRunId: string;
  readonly stepId: string | null;
  readonly stepPath: string[];
  readonly parentStepId: string | null;
  readonly signal: AbortSignal;

  step: StepFn;
  memoryScopeWithSuffix: (suffix: string) => string;
  emit(name: string, payload?: unknown): void;
  setTitle(title: string): Promise<void>;
};
```

```ts
const handle = workflow.run(input);
handle.workflowRunId;
await handle.result;
handle.cancel();
```

`workflow.stream(input)` yields live `RunEvent`s via an async iterator while the run executes.

### Run Titles

`ctx.setTitle(title)` sets the inspector display name for this workflow run. Call it at the start of `run`, after a first step, or just before returning — blank titles are ignored.

```ts
export const literatureReview = adl.createWorkflow({
  id: "literature-review",
  inputSchema: z.object({ topic: z.string() }),
  async run(input, ctx) {
    await ctx.setTitle(`Literature review: ${input.topic}`);
    // ...
  },
});
```

### Run Tags

Pass a second argument on `workflow.run` (or `tags` on `agent.run`) to label that invocation. The CLI has no `--tags` flag; the inspection UI start dialog does not collect tags either. The UI still shows whatever was recorded — caller tags plus automatic provenance — in a **Tags** footer on the workflow-run and agent-conversation inspectors. There is no run-list filter.

```ts
await searchPapers.run({ topic: "CRISPR" }, { tags: ["dataset:qa-v1"] });
await researcher.run({ user: "Summarize CRISPR", tags: ["dataset:qa-v1"] });
```

Every run also records which project code produced it, unless you already passed a tag with the same prefix:

- `version:<value>` when `createAdlRuntime({ version })` is a string
- otherwise `commit:<id>` from jj `@` first, then git HEAD, with `+dirty` if the tree has uncommitted work

`createAdlRuntime({ version: false })` skips that lookup (`createTestRuntime` does this). See [Runtime](/core/runtime/).

## Events

| Event           | Purpose                                         |
| --------------- | ----------------------------------------------- |
| `step_started`  | `stepId`, `parentStepId`, `name`, `key`, `path` |
| `step_finished` | Terminal success with `output`                  |
| `step_skipped`  | Reused cached `output`                          |
| `step_failed`   | Error payload                                   |
| `custom`        | Author event from `ctx.emit(name, payload?)`    |

`ctx.emit(name, payload?)` always persists as `type: "custom"`. You do not pass a type, and you cannot emit reserved runtime types (`workflow_*`, `step_*`, `agent_*`). Every `RunEvent` has a per-run **`runSeq`** (SQLite column `run_seq`), distinct from the process-wide **`logSeq`** on the in-memory event log.

OpenTelemetry: one span per `stepId`; parent link = `parentStepId`.

## Templates in Workflows

Templates are standalone — no `ctx.render`. They use **Handlebars** (`{{var}}`, `{{#each}}`, …) after Zod parse. Define with `adl.createTemplate` in your prompts module:

```ts
// prompts/find-papers.ts
import { z } from "zod";

import { adl } from "#adl";

export const findPapersPrompt = adl.createTemplate({
  path: "./prompts/find-papers.md",
  from: import.meta.url,
  inputData: z.object({ topic: z.string(), maxResults: z.number() }),
});
```

```ts
// workflows/literature-review.ts
import { z } from "zod";

import { adl } from "#adl";
import { researcher } from "../agents/researcher";
import { findPapersPrompt } from "../prompts/find-papers";

export const literatureReview = adl.createWorkflow({
  id: "literature-review",
  inputSchema: z.object({ topic: z.string() }),
  async run(input, ctx) {
    const text = findPapersPrompt.render({ topic: input.topic, maxResults: 10 });
    await researcher.run({ memoryScope: ctx.memoryScopeWithSuffix("draft"), user: text });
    return { topic: input.topic };
  },
});
```

See [Template](/api/interfaces/template/) in the API reference.

## Parallelism

`ctx.step` returns a `Promise`. Use `Promise.all` with **distinct keys** when running parallel steps with the same name.

## Cancellation

`handle.cancel()` aborts `ctx.signal` for that run. The runtime:

- Rejects in-flight `ctx.step` callbacks (they can also listen to `ctx.signal`)
- Links child `agent.run` / `agent.stream` AbortControllers to the same signal, so `streamText` stops
- Emits `workflow_cancelled` (and `step_failed` for the interrupted step)

Nested `workflow.run()` shares the parent's abort. `{ isolated: true }` runs keep their own signal.

```ts
const handle = review.run({ topic: "CRISPR delivery" });
handle.cancel();
await handle.result.catch((error) => {
  // DOMException AbortError (or the abort reason)
});
```
