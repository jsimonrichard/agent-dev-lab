---
title: Workflows
description: adl.createWorkflow, ctx.step, nesting, keys, step caching, and run retry.
---

Workflows are pure TypeScript orchestration: `if` / `for` / `try` / `await` / `Promise.all` — no graph DSL. **Steps** mark observable, retryable units whose outputs are cached on [`WorkflowStore`](/api/interfaces/workflowstore/); nested workflows provide typed, reusable modules.

## Two composition primitives

|              | **`ctx.step`**                                                   | **Nested workflow**                         |
| ------------ | ---------------------------------------------------------------- | ------------------------------------------- |
| **Purpose**  | Observability span + **retry boundary** (cached step output)     | Reusable unit with typed **input → output** |
| **Contract** | Closure captures anything; return value becomes persisted output | Optional Zod `input` / `output` schemas     |
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
  input: z.object({ topic: z.string() }),
  output: z.object({ papers: z.array(z.string()) }),
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

## Isolated runs

By default, `otherWorkflow.run(input)` **nests**: it joins the active parent via ALS (or explicit `parentCtx`), shares that `workflowRunId`, and records inner steps on the parent's event stream — they show up in that run's inspector tree.

`{ isolated: true }` starts a **separate** run instead of nesting:

|                 | Nested (default)             | `{ isolated: true }`                                         |
| --------------- | ---------------------------- | ------------------------------------------------------------ |
| Parent          | Joins ALS / `parentCtx`      | Ignores parent                                               |
| `workflowRunId` | Shared with parent           | New id                                                       |
| Persistence     | Events on the parent run     | Own row on [`WorkflowStore`](/api/interfaces/workflowstore/) |
| Inspector tree  | Inner steps under the parent | Own tree, not folded into the caller                         |

Isolated does **not** mean “skip the database.” The run is persisted. Whether it appears in the inspection UI is the project registry: only workflows in `adl.config` `workflows` are listed as startable targets and run history. Leave a helper out of that array to keep its runs stored but hidden.

```ts
// Inside a parent workflow (or an agent episode that happens to be in one):
await helper.run(input, { isolated: true }).result;
```

Conversation [`titleWorkflow`](/core/agents/#conversation-titles) uses this so naming a chat does not inject steps into another workflow's tree.

## Input and output types

Zod `input` / `output` on `createWorkflow` both **validate at runtime** and **infer TypeScript types**. Zod is optional. Pin types with generics (or by annotating `run`) when you do not want a runtime schema:

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

## Step callback shape

```ts
await ctx.step("outline", async ({ ctx }) => {
  await ctx.step("draft", async ({ ctx }) => {
    // ...
  });
});
```

Nested workflow `run(input)` accepts the same child `ctx` via ALS when called from inside a parent.

## Step identity

| Field              | Meaning                                         |
| ------------------ | ----------------------------------------------- |
| **`stepId`**       | Unique per invocation (UUID)                    |
| **`name`**         | First argument to `step("…", …)`                |
| **`key`**          | Optional disambiguator (React-style)            |
| **`stepPath`**     | Stable logical path from `(name, key)` ancestry |
| **`parentStepId`** | Parent invocation, or `null` at run root        |

Path segments: `name` when `key` is omitted, or `` `${name}:${key}` `` when keyed.

## Step keys

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

**Resume** here means **re-entering a workflow run**: skip completed steps via cached output, re-run the rest. That uses [`WorkflowStore`](/api/interfaces/workflowstore/). Inspection replay also reads this store; it does not re-execute the workflow.

[`MessageStore`](/api/interfaces/messagestore/) is **not** a resume path. Same `memoryScope` on a later `agent.run` is ordinary **conversation memory** (load / append / save). See [Agents — Calling an agent](/core/agents/#calling-an-agent). The stores only meet when a **retried step** calls an agent again — skip is `WorkflowStore`; the transcript the model sees is `MessageStore`.

### Steps are atomic retry units

A **`ctx.step` callback is one atomic unit** from the framework’s point of view. On retry, ADL can only:

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

Code **between** steps (top-level `run` body, loops, variables in closure) is **not** persisted. Only step **return values** are stored. Design workflows so retry-relevant state flows through step outputs or explicit inputs, not mutable closure variables alone.

### Step output cache (skip-on-retry)

Return value from the callback is persisted as step **output** on `WorkflowStore` and mirrored in `step_finished` events.

When re-running with the **same `workflowRunId`**, **`ctx.step`** checks the store **before** invoking the callback:

- If `getStepOutput` hits → emit `step_skipped`, return cached output (closure body does not re-run).
- Otherwise run callback, `recordStepComplete`, return output.

```ts
const first = workflow.run(input);
await first.result.catch(() => {}); // failed mid-run

// Retry: same run id — completed steps are skipped, failed step re-runs
const retry = workflow.run(input, { workflowRunId: first.workflowRunId });
await retry.result;
```

You can also start a **new** run with the same input (new `workflowRunId`) — that is a fresh execution with no step skip unless you implement your own policy.

### Force a step to re-run

Pass `{ force: true }` to ignore cached output for one step:

```ts
await ctx.step(
  "search",
  async ({ ctx }) => {
    /* ... */
  },
  { force: true },
);
```

Use this when inputs changed, you need to invalidate a prior success, or you are debugging.

### Agents on retry

Step skip **does not** skip an LLM call by itself — it skips the **entire step callback**. If the step runs, `agent.run` executes again and typically **loads** the existing transcript for its `memoryScope` ([Agents](/core/agents/#memoryscope)). That is **memory** (model sees prior turns), not skipping the model and not restoring the workflow.

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
  emit(event: { type: "custom"; name: string; payload: unknown }): void;
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

### Run titles

`ctx.setTitle(title)` sets the inspector display name for this workflow run. Call it at the start of `run`, after a first step, or just before returning — blank titles are ignored.

```ts
export const literatureReview = adl.createWorkflow({
  id: "literature-review",
  input: z.object({ topic: z.string() }),
  async run(input, ctx) {
    await ctx.setTitle(`Literature review: ${input.topic}`);
    // ...
  },
});
```

## Events

| Event           | Purpose                                         |
| --------------- | ----------------------------------------------- |
| `step_started`  | `stepId`, `parentStepId`, `name`, `key`, `path` |
| `step_finished` | Terminal success with `output`                  |
| `step_skipped`  | Reused cached `output`                          |
| `step_failed`   | Error payload                                   |

OpenTelemetry: one span per `stepId`; parent link = `parentStepId`.

## Templates in workflows

Templates are standalone — no `ctx.render`. Define with `adl.createTemplate` in your prompts module:

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
  input: z.object({ topic: z.string() }),
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
