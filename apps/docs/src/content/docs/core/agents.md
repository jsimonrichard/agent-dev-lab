---
title: Agents
description: adl.createAgent, run and stream, memoryScope, structured output, and tools.
---

Agents are reusable model configurations: identity (system prompt), model, tools, memory binding, and optional structured output. One agent episode per `run()` — multi-step tool loops belong in workflow TypeScript (or `runAgentUntilIdle` for the common “keep going until no tool calls” pattern). The inspection UI conversation composer uses that helper.

## createAgent

Registry modules `import { adl } from "#adl"` (`src/adl.ts`) and call `adl.createAgent`:

```ts
// agents/researcher.ts
import { tool } from "@agent-dev-lab/core";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";

import { adl } from "#adl";

export const researcher = adl.createAgent({
  id: "researcher",

  systemPrompt: adl.createTemplate({
    path: "./researcher.md",
    from: import.meta.url,
    inputData: z.object({}),
  }),

  model: openai("gpt-4o"), // optional when createAdlRuntime({ defaults: { model } }) is set

  tools: {
    search: tool({
      description: "Search for papers",
      inputSchema: z.object({ query: z.string() }),
      execute: async ({ query }) => ({ papers: [] as string[] }),
    }),
  },

  outputSchema: z.object({ summary: z.string() }),

  // Optional: a workflow names the conversation after the first reply.
  // titleWorkflow: conversationTitle,

  // memory.store defaults to runtime stores.message when omitted
});
```

`id` is the registry key listed in `adl.config` `agents` array.

Install a model provider package (e.g. `@ai-sdk/openai`) in your project for `model`.

### Conversation titles

Optional **`titleWorkflow`** is a workflow that names the conversation after the first successful episode on a new `memoryScope`. It does not run on follow-up turns. The workflow is typed: it receives the transcript and must return `{ title: string }`. Title generation is best-effort — failures do not fail the conversation turn.

Pin those types with generics (Zod on the workflow is optional):

```ts
import type { ConversationTitleInput, ConversationTitleOutput } from "@agent-dev-lab/core";
import { z } from "zod";

const namer = adl.createAgent({
  id: "conversation-title-namer",
  systemPrompt: "Reply with a short conversation title.",
  outputSchema: z.object({ title: z.string() }),
});

export const conversationTitle = adl.createWorkflow<
  ConversationTitleInput,
  ConversationTitleOutput
>({
  id: "conversation-title",
  async run(input, ctx) {
    const episode = await namer.run({
      memoryScope: ctx.memoryScopeWithSuffix("namer"),
      user: `Write a short title.\n\n${format(input.messages)}`,
    }).result;
    return { title: episode.output.title };
  },
});

export const researcher = adl.createAgent({
  id: "researcher",
  systemPrompt: "You are a research assistant.",
  titleWorkflow: conversationTitle,
});
```

Keep the title workflow out of the `adl.config` `workflows` array if you do not want those runs listed in the inspection UI. Keep any inner title-namer agent out of the `agents` array unless you want those helper conversations listed. The runtime starts the title workflow with [`{ isolated: true }`](/core/workflows/#isolated-runs) so it is a separate persisted run and is not nested inside another workflow's tree.

### System prompt

Declared as a **template ref** or static string. On a **new** `memoryScope`, the resolved text is persisted as the first stored message and passed to the AI SDK via the **`system`** option (not `messages`, which avoids the SDK's system-in-messages warning). Later episodes on that scope reuse the pinned copy, so a hot-reload of the live definition does not change an in-flight conversation.

The inspection UI shows the pinned stored prompt when one exists, and overlays the live `agent.systemPrompt` inspect result for empty or legacy scopes that have not pinned yet (`isErr` when a template cannot render). Stray `system` messages in caller `messages` are dropped before the model call.

Volatile turn context belongs in **user** messages, not in the system prompt.

### Structured output

| Level         | Field                               | Behavior                                                        |
| ------------- | ----------------------------------- | --------------------------------------------------------------- |
| Agent default | `adl.createAgent({ outputSchema })` | Every `run` / `stream` uses structured output unless overridden |
| Per call      | `agent.run({ outputSchema })`       | Overrides agent default for one episode                         |

Implementation uses **`streamText`** with `experimental_output` when a schema is set — same path for `run` and `stream`. `Agent` is generic over `TOutput` (inferred from `outputSchema`, defaulting to `string`). `AgentRunResult.output` is that type: the parsed object when a schema is set, or the episode `text` when it is not.

### What agents do not carry

- **`stopWhen` / step limits** — workflow concern.
- **Memory pipeline** — deferred; v1 uses load/append/save directly.
- **Multi-step tool loops** — `stopWhen: stepCountIs(1)` limits each episode to one SDK step. Import `stepCountIs` from `@agent-dev-lab/core` (re-exported from `ai`) when you drive a tool loop in a workflow. Call `runAgentUntilIdle` (or write a `for` loop like the playground `answer-question` workflow) to continue until the model stops calling tools.

## memoryScope

Opaque string selecting a **conversation message list** in the store:

```ts
`run:${runId}:step:outline`;
`user:${userId}:chat:${chatId}`;
```

Same agent + same `memoryScope` → shared history. New scope → new conversation.

This is **conversation memory**, not workflow resume: the runner `load`s the transcript, appends this turn, and `save`s. It does not require a workflow or the same `workflowRunId`. Step retry (skip completed `ctx.step` outputs) is a separate [`WorkflowStore`](/api/interfaces/workflowstore/) path — see [Workflows — Resumability](/core/workflows/#resumability). On a retried step that calls `agent.run` again, both can apply.

## Run context

Optional **`context`** on `agent.run()` forwards to tool `execute` via AI SDK `experimental_context`:

```ts
const handle = literatureReview.run({ topic: "CRISPR delivery" });
const runId = handle.workflowRunId;

await researcher.run({
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
import type { CoreMessage } from "@agent-dev-lab/core";
import type { z } from "zod";

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

1. `store.load(memoryScope)` (any `system` messages are filtered out)
2. If `user` / `messages` → append to working list
3. Resolve `systemPrompt` → pass as the **`system`** option to `streamText`
4. **`streamText`** — forward text deltas to run events
5. Append `response.messages` to store via `save`
6. Return `AgentRunResult`

## Tool calls and persistence

ADL persists **only** `CoreMessage` lists. Tool usage round-trips through SDK message shape:

- Assistant parts with `tool-call`
- Tool role messages with `tool-result`

After `run()`, extend the store with messages from `result.response.messages` — not from `toolCalls` alone.

To keep calling the model after tools execute, re-run on the same `memoryScope` without a new user message (tool results are already in the store):

```ts
import { runAgentUntilIdle } from "@agent-dev-lab/core";

const { result, turns } = await runAgentUntilIdle(researcher, {
  memoryScope: "scope-1",
  user: "What is ADL?",
});
```

`runAgentUntilIdle` is a convenience loop around `agent.run()`. Workflows that want each tool round as its own `ctx.step` should keep an explicit TypeScript loop instead.

## Agents and workflows as tools

```ts
// agents/orchestrator.ts — register tools on an agent that runs inside a workflow
import { adl } from "#adl";
import { z } from "zod";

import { researcher } from "./researcher";
import { literatureReview } from "../workflows/literature-review";

const literatureReviewTool = adl.createToolFromWorkflow(literatureReview, {
  description: "Run the full literature review workflow",
});

const researcherTool = adl.createToolFromAgent(researcher, {
  description: "Run one research episode",
  inputSchema: z.object({
    threadId: z.string(),
    query: z.string(),
  }),
  mapRun: (toolArgs, { ctx }) => ({
    memoryScope: ctx.memoryScopeWithSuffix(`tool:${toolArgs.threadId}`),
    user: toolArgs.query,
  }),
});
```

`createToolFromAgent` / `createToolFromWorkflow` return an AI SDK `Tool<TInput, TOutput>`. Agent tools use the agent's `TOutput` (inferred from `outputSchema`, otherwise `string`). Pass `inputSchema` so `mapRun` / `mapInput` receive typed arguments instead of a catch-all object.

These helpers require an active workflow context (ALS).

## Events

The runner emits run events via `RunRecorder`: `agent_started`, `agent_text_delta`, `agent_messages_committed`, `agent_finished`, `agent_failed`. See [RunEvent](/api/type-aliases/runevent/) and [WorkflowStore](/api/interfaces/workflowstore/) in the API reference.
