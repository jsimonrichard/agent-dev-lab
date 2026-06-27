---
title: Agents
description: adl.createAgent, run and stream, memoryScope, structured output, and tools.
---

Agents are reusable model configurations: identity (instructions), model, tools, memory binding, and optional structured output. One agent episode per `run()` — multi-step tool loops belong in workflow TypeScript.

## createAgent

Registry modules import `adl` from your runtime module and call `adl.createAgent`:

```ts
import { tool } from "@agent-dev-lab/core";
import { z } from "zod";

import { adl } from "../runtime/adl";

export const researcher = adl.createAgent({
  id: "researcher",

  instructions: adl.createTemplate({
    path: "./researcher.md",
    from: import.meta.url,
    inputData: z.object({}),
  }),

  model: openai("gpt-4o"),

  tools: {
    search: tool({
      /* AI SDK tool */
    }),
  },

  outputSchema: z.object({ summary: z.string() }).optional(),

  memory: {
    store: customMessageStore, // optional; defaults to runtime stores.message
  },
});
```

`id` is the registry key listed in `adl.config` `agents` array.

### Instructions

Declared as a **template ref** or static string. On the **first** `run()` for a given `memoryScope` when the store is empty:

1. Render the template.
2. Append `{ role: "system", content: rendered }` to the store.
3. **Persist** — do not re-render on later turns.

Volatile turn context belongs in **user** messages, not re-injected system text.

### Structured output

| Level         | Field                               | Behavior                                                        |
| ------------- | ----------------------------------- | --------------------------------------------------------------- |
| Agent default | `adl.createAgent({ outputSchema })` | Every `run` / `stream` uses structured output unless overridden |
| Per call      | `agent.run({ outputSchema })`       | Overrides agent default for one episode                         |

Implementation uses **`streamText`** with `experimental_output` when a schema is set — same path for `run` and `stream`. `AgentRunResult` includes `output`, `text`, `messages`, `newMessages`, and `sdk`.

### What agents do not carry

- **`stopWhen` / step limits** — workflow concern.
- **Memory pipeline** — deferred; v1 uses load/append/save directly.
- **Multi-step tool loops** — `stopWhen: stepCountIs(1)` limits each episode to one SDK step.

## memoryScope

Opaque string selecting a **conversation message list** in the store:

```ts
`run:${runId}:step:outline``user:${userId}:chat:${chatId}`;
```

Same agent + same `memoryScope` → shared history. New scope → new conversation (new system bootstrap when store is empty).

## Run context

Optional **`context`** on `agent.run()` forwards to tool `execute` via AI SDK `experimental_context`:

```ts
await agent.run({
  memoryScope: "scope-1",
  user: "Summarize this",
  context: { resourceId: "user-42", runId },
});
```

`context` is **not** stored in `MessageStore` and is **not** sent to the model unless a tool or workflow copies it into a message.

## agent.run and agent.stream

Both use the same internal `streamText` implementation:

| API                | Caller sees                           | Runner behavior                                                  |
| ------------------ | ------------------------------------- | ---------------------------------------------------------------- |
| **`agent.run`**    | `AgentRunHandle` (`result`, `cancel`) | Drains stream internally; observers still get `agent_text_delta` |
| **`agent.stream`** | `AgentStreamHandle` with SDK streams  | Exposes `textStream` / `fullStream`; same persistence on finish  |

```ts
type AgentRunInput = {
  memoryScope: string;
  context?: unknown;
  user?: string;
  messages?: CoreMessage[];
  outputSchema?: z.ZodType<unknown>;
  workflow?: { workflowRunId: string; stepId: string | null };
};
```

### Per-run flow

1. `store.load(memoryScope)`
2. If empty → render `instructions` → append and persist **system** message
3. If `user` / `messages` → append to working list
4. **`streamText`** — forward text deltas to run events
5. Append `response.messages` to store via `save`
6. Return `AgentRunResult`

## Tool calls and persistence

ADL persists **only** `CoreMessage` lists. Tool usage round-trips through SDK message shape:

- Assistant parts with `tool-call`
- Tool role messages with `tool-result`

After `run()`, extend the store with messages from `result.response.messages` — not from `toolCalls` alone.

## Agents and workflows as tools

```ts
import { adl } from "../runtime/adl";

const literatureReviewTool = adl.createToolFromWorkflow(literatureReview, {
  description: "Run the full literature review workflow",
});

const researcherTool = adl.createToolFromAgent(researcher, {
  mapRun: (toolArgs, { ctx }) => ({
    memoryScope: ctx.memoryScope(`tool:${toolArgs.threadId}`),
    user: toolArgs.query,
  }),
});
```

These helpers require an active workflow context (ALS).

## Events

The runner emits run events via `RunRecorder`: `agent_started`, `agent_text_delta`, `agent_messages_committed`, `agent_finished`, `agent_failed`. See [RunEvent](/api/type-aliases/runevent/) and [WorkflowStore](/api/interfaces/workflowstore/) in the API reference.
