---
title: Workflows
description: adl.createWorkflow, ctx.step, nesting, keys, and step caching.
---

Workflows are pure TypeScript orchestration: `if` / `for` / `try` / `await` / `Promise.all` — no graph DSL. Steps provide observability spans; nested workflows provide typed, reusable modules.

## Two composition primitives

|              | **`ctx.step`**               | **Nested workflow**                         |
| ------------ | ---------------------------- | ------------------------------------------- |
| **Purpose**  | Observability + logical span | Reusable unit with typed **input → output** |
| **Contract** | Closure captures anything    | Optional Zod `input` / `output` schemas     |
| **Reuse**    | Extract plain TS functions   | `otherWorkflow.run(input)`                  |
| **Tracing**  | Always creates a step node   | Inner workflow defines its own steps        |
| **Best for** | “Do this chunk under a span” | “Named, testable sub-process”               |

Typically **`step` around a nested `run`** when you want the sub-workflow visible as one waterfall bar:

```ts
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

// inside another workflow body:
await ctx.step("search", async ({ ctx: child }) => {
  const { papers } = await searchPapers.run({ topic: input.topic }).result;
  return papers;
});
```

Calling `searchPapers.run` **without** `step` is valid when you do not need an extra span.

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

## Step outputs and skip-on-retry

Return value from the callback is persisted as step **output** on `WorkflowStore` and mirrored in `step_finished` events.

When re-running with the same `workflowRunId`, **`ctx.step`** checks the store **before** invoking the callback:

- If `getStepOutput` hits → emit `step_skipped`, return cached output (closure body does not re-run).
- Otherwise run callback, `recordStepComplete`, return output.

## WorkflowContext

```ts
type WorkflowContext = {
  readonly workflowRunId: string;
  readonly stepId: string | null;
  readonly stepPath: string[];
  readonly parentStepId: string | null;

  step: StepFn;
  memoryScope: (suffix: string) => string;
  emit(event: { type: "custom"; name: string; payload: unknown }): void;
};
```

```ts
const handle = workflow.run(input);
handle.workflowRunId;
await handle.result;
handle.cancel();
```

`workflow.stream(input)` yields live `RunEvent`s via an async iterator while the run executes.

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
import { adl } from "#adl";

export const findPapersPrompt = adl.createTemplate({
  path: "./prompts/find-papers.md",
  from: import.meta.url,
  inputData: z.object({ topic: z.string(), maxResults: z.number() }),
});

// inside a workflow step:
const text = findPapersPrompt.render({ topic: "CRISPR", maxResults: 10 });
await agent.run({ memoryScope: ctx.memoryScope("draft"), user: text });
```

See [Template](/api/interfaces/template/) in the API reference.

## Parallelism

`ctx.step` returns a `Promise`. Use `Promise.all` with **distinct keys** when running parallel steps with the same name.

## Known limitations

- **Cancellation** — `handle.cancel()` exists but the abort signal is not yet propagated into step callbacks or child agents.
- **Force re-run** — no `ctx.step(..., { force: true })` yet to ignore cached output.
