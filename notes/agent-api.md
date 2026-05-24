# Agent API (draft)

Design notes for the first ADL **agent** surface in `@agent-dev-lab/runtime`. Workflows, project registry, and the memory pipeline are separate; this doc focuses on agents, templates, and message persistence.

**Status:** Agreed direction for v1 implementation planning. Not yet implemented in code.

## Goals

- **TypeScript-first**, headless, AI SDK–native (`ModelMessage` / `CoreMessage`, `generateText`, `tool()`).
- **Agents** = one model episode per `run()` (no multi-step tool loop config on the agent; workflows own loops in plain TS).
- **Templates** stay pure (`createTemplate().render(inputData) → string`); usable outside workflows — see [`templates-api.md`](./templates-api.md).
- **Memory** = scoped message lists; tool calls and results live **in** the list as messages, not in a parallel store.

## Related docs

- Project principles: [`design-overview.md`](./design-overview.md)
- Message persistence (`MessageStore`): [`message-store.md`](./message-store.md) — **planned**; not in runtime yet
- Deferred memory shaping: [`memory-pipeline.md`](./memory-pipeline.md)
- Project registry & `workflow.run`: [`project-api.md`](./project-api.md)
- Streaming & UI live runs: [`streaming-api.md`](./streaming-api.md)

---

## `createAgent`

An agent is a reusable configuration: identity (instructions), model, tools, memory store binding, and optional defaults.

```ts
import { createAgent, createTemplate } from "@agent-dev-lab/runtime";

/** `id` is the registry key (CLI, UI, stores) — listed in adl.config `agents` array */
export const researcher = createAgent({
  id: "researcher",

  /** Rendered once per new conversation scope; persisted as a system message. */
  instructions: createTemplate({
    path: "./researcher.md",
    inputData: z.object({}), // or project-specific schema
  }),

  model: openai("gpt-4o"),

  tools: {
    search: tool({ /* AI SDK tool */ }),
  },

  /**
   * Optional per-agent override. When omitted, uses `adl.config` `stores.memory`.
   * See message-store.md (not implemented in runtime yet).
   */
  memory?: {
    store?: MessageStore;
  },
});
```

### Instructions (system prompt)

- Declared on the agent as a **template ref** or static string.
- On the **first** `run()` for a given `memoryScope` when the store has no messages yet:
  1. Render the template (with optional `instructionsData` if we add it later).
  2. Append `{ role: "system", content: rendered }` to the store.
  3. **Persist** that message. Do not re-render on later turns (avoids non-deterministic Handlebars and matches inspection/replay).

Volatile context for a turn belongs in a **user** message (workflow template or plain string), not in re-injected system text.

### Tools

- Standard AI SDK `tool()` definitions on the agent.
- **Execution** for v1: either the SDK `execute` on the tool, or the workflow runs a tool loop and appends results—TBD in workflow doc. Regardless, **persistence** is always via messages (below).

### What agents do *not* carry

- **`stopWhen` / step limits** — workflow concern (TypeScript loops, conditions, cost caps).
- **Memory pipeline** — deferred ([`memory-pipeline.md`](./memory-pipeline.md)); v1 may use a fixed policy (e.g. pass-through or simple last-N in the runner without a public pipeline API).

---

## Templates vs message store

Templates do not read or write the store. Only the **agent runner** connects them:

| When | Role | Source |
|------|------|--------|
| New `memoryScope` (empty store) | `system` | Agent `instructions` template → render once → **persist** |
| Each `run()` | `user` (typical) | Caller `user` string or `stepTemplate.render(inputData)` → append → persist after call |

Workflows should not re-bootstrap system prompts. They pass turn input; the agent owns standing instructions.

---

## Memory scope

### v1: `memoryScope: string`

A single opaque key selects the **conversation message list** in the store. The caller (usually the workflow) builds the string:

```ts
// Examples — conventions are project-defined, not enforced by ADL
`run:${runId}:step:outline`
`user:${userId}:chat:${chatId}`
`${runId}:researcher`
```

Same agent + same `memoryScope` → shared history. New scope → new conversation (new system bootstrap when store is empty).

This replaces Mastra-style **`thread`** ids for *chat history*. It intentionally does **not** encode resource/user scope—that belongs in **`context`** (below) and in tools that choose their own storage keys.

---

## Run `context` (Mastra-like resource semantics without dual IDs)

### Idea

Pass an optional, arbitrary **`context`** on `agent.run()`. The agent runner forwards it to tool `execute` functions (via AI SDK `experimental_context`). Tools that need cross-conversation state, working memory, or RAG use **fields from `context`** (e.g. `resourceId`, `userId`, `db`, `runId`) to read/write—**not** the message store API baked into ADL.

| Concern | Mechanism |
|---------|-----------|
| What the model reads (turn-by-turn chat) | `memoryScope` → `MessageStore` of `CoreMessage[]` |
| What tools / side logic use (identity, DB, shared prefs) | `context` on each `run()` |
| Mastra “thread” | Your `memoryScope` string convention |
| Mastra “resource” | A key inside `context` that **your tools** use (e.g. `context.resourceId`) |

ADL does not need a first-class `resource` parameter if tools and optional core helpers are parameterized by `context`.

### How `agent.run` passes `context` to tools

ADL does **not** add a separate “agent completion” API beyond what the AI SDK already exposes. There is no extra field on a model or on `tool()` for context.

Flow:

1. Caller: `agent.run({ memoryScope, user, context })`
2. Runner: `messages = await messageStore.load(memoryScope)` (+ bootstrap, user append)
3. Runner calls **`generateText`** (or `streamText`) with:
   - `model`, `tools`, `messages` — standard AI SDK
   - **`experimental_context: context`** — the only wire from `run()` into tool execution
4. When the model invokes a tool, the SDK runs `execute(input, options)` where **`options.experimental_context`** is that same object (plus `toolCallId`, `messages`, `abortSignal`, …)

```ts
// Inside the ADL agent runner (conceptual)
const result = await generateText({
  model: agent.model,
  tools: agent.tools,
  messages: preparedMessages,
  experimental_context: input.context,
});

// Inside a tool you defined with `tool()` from `ai`
execute: async (input, { experimental_context }) => {
  const ctx = experimental_context as ResearchContext;
  // ...
},
```

So: **`context` on `run()` → `experimental_context` on `generateText` → `experimental_context` in `execute`**. Not injected into the prompt unless a tool or workflow copies it into a message.

Note: the AI SDK also ships an experimental **`Agent`** class (`Experimental_Agent` in v5 exports). ADL **`createAgent` is our own** wrapper; it should still delegate to `generateText` / `streamText` for v1, not a separate completion shape.

### Generics (planned)

Use type parameters where they catch real mistakes at compile time:

```ts
import type { ToolSet } from "ai";

// Context = per-run bag for tools; Tools = agent tool set (for inference)
export function createAgent<
  Context = undefined,
  Tools extends ToolSet = ToolSet,
>(config: AgentDefinition<Context, Tools>): Agent<Context, Tools> { ... }

export interface AgentRunInput<Context> {
  memoryScope: string;
  context?: Context;
  user?: string;
  messages?: CoreMessage[];
}

export interface Agent<Context, Tools extends ToolSet> {
  run(
    input: AgentRunInput<Context>,
  ): Promise<AgentRunResult<Tools>>;
}
```

**`Context`**: when `undefined` or omitted, `context` on `run()` is optional. When set, `run({ context: ... })` must satisfy `Context`.

**`Tools`**: enables typed `AgentRunResult` / SDK result (`GenerateTextResult<Tools>`) and lets helpers infer tool names from the agent definition.

**Tools and context typing:** the SDK does not yet thread `Context` into `tool()`’s `execute` callback automatically (v5 uses `experimental_context?: unknown`). Options:

- Assert/narrow in `execute`: `experimental_context as Context` (document the convention).
- When upgrading SDK, adopt **`contextSchema`** on `tool()` if available so `execute` is typed from the schema.

Optional helper (later, not required for v1):

```ts
export function createTool<Context, Input, Output>(def: {
  /* ... */
  execute: (input: Input, options: ToolCallOptions & { context: Context }) => Promise<Output>;
}): Tool<...>;
```

`createAgent` would still only forward `context` via `generateText`; the helper documents the expected shape.

### Guidelines

- **Do not put large or secret blobs in `context` for the model** — `context` is not automatically injected into prompts. Only tools (and workflow code) see it.
- **Persisted state** still lands in the message list (tool results as messages) or in storage that tools address via `context` keys.
- **Conventions, not enforcement**: document suggested keys (`resourceId`, `threadId`, `runId`) in project/workflow docs; ADL stays agnostic.
- **Optional core tools** (later): e.g. `createWorkingMemoryTool({ keyFromContext: (c) => c.resourceId })`) ship in runtime but remain ordinary AI SDK tools—no special “memory tool” runtime primitive.

### Compared to encoding everything in `memoryScope`

| Approach | Pros | Cons |
|----------|------|------|
| Only `memoryScope` strings | Minimal API | Awkward for “same user, new thread, shared profile”; string parsing as protocol |
| `thread` + `resource` first-class | Familiar to Mastra users | Two IDs on every call; ADL must define merge semantics |
| `memoryScope` + `context` | Simple history key; flexible resource semantics via tools | Projects must define conventions; core library may ship helpers |

**Recommendation:** adopt `memoryScope` + optional typed `context`; defer first-class `resource` until a clear pattern emerges from real tools.

---

## `agent.run()`

```ts
type AgentRunInput<Context = unknown> = {
  /** Selects the message list in the store. */
  memoryScope: string;

  /**
   * Passed to tool execute (AI SDK experimental_context).
   * Not sent to the model unless a tool or workflow does so explicitly.
   */
  context?: Context;

  /**
   * Turn input appended as a user message before the model call.
   * Omit only when continuing a thread with no new user text (rare).
   */
  user?: string;

  /**
   * Advanced: extra messages merged for this call only (e.g. tool results
   * appended by a workflow loop). Must be valid ModelMessages.
   */
  messages?: CoreMessage[];

  /**
   * Future (not v1): allow episode cache lookup when message fingerprint matches.
   * Default false — agents with side-effect tools must not cache unless safe.
   * See resumability.md.
   */
  cacheable?: boolean;
};

type AgentRunResult = {
  /** Text from the model for this episode (last step if SDK returns multiple). */
  text: string;

  /** Messages passed to the model for this call (after load + bootstrap + user + any pipeline). */
  messages: CoreMessage[];

  /**
   * New messages to persist from this episode — append to the store.
   * Prefer SDK `result.response.messages` (see Tool calls).
   */
  newMessages: CoreMessage[];

  /** Raw AI SDK result for advanced callers / events. */
  sdk: GenerateTextResult<...>;
};
```

Parameter name is **`memoryScope`**, not `memory`, to avoid confusion with a future `Memory` / pipeline type.

### Per-run flow (v1)

1. `store.load(memoryScope)`
2. If empty → render `instructions` → append and persist **system** message
3. If `user` → append **user** message (persist with commit or as part of final save)
4. *(Future)* memory pipeline shapes the list — deferred
5. **`streamText`** internally (even for `agent.run`) — drain stream, forward chunks to observers; resolve when complete — see [`streaming-api.md`](./streaming-api.md)
6. Append `newMessages` from SDK response to store
7. Return `AgentRunResult`

---

## Tool calls and message persistence

### Canonical form: messages

ADL persists **only** `CoreMessage` (`ModelMessage` in AI SDK 5) lists. Tool usage must round-trip through the same format the SDK expects:

- **Assistant** message with `content` array containing `{ type: "tool-call", toolCallId, toolName, args }` parts (and optional text parts).
- **Tool** message with `role: "tool"` and `content` array of `{ type: "tool-result", toolCallId, toolName, result | output }` parts.

These are valid `CoreMessage` variants (`CoreAssistantMessage`, `CoreToolMessage`). There is no separate parallel “tool call log” in the store.

### AI SDK `GenerateTextResult` mapping

For a single `generateText` call (v1 agent episode):

| SDK field | Use in ADL |
|-----------|------------|
| `result.response.messages` | **`newMessages`** to append to the store. Assistant + tool messages from this episode, already in model shape. |
| `result.toolCalls` | **Convenience only** — flat list of tool calls from the **last** step. Do not treat as the source of truth for persistence. |
| `result.toolResults` | **Convenience only** — parallel to last-step tool calls. |
| `result.steps` | Populated when the workflow runs multiple SDK steps; agent v1 may expose via `sdk` for events, not duplicate in `toolCalls` on `AgentRunResult`. |

**Rule:** After `run()`, extend the store with `newMessages` (from `response.messages`). Reconstructing history from `toolCalls` alone is insufficient (misses message structure, ids, text alongside calls).

### Workflow tool loops

When the workflow (not the agent) drives “call model → execute tools → call again”:

1. `run()` → persist assistant/tool messages from `newMessages`.
2. Workflow executes tools if needed (or SDK auto-execute on tools with `execute`).
3. Next `run()` on the **same** `memoryScope` with more `user` / `messages`, or a single SDK call with `stopWhen` inside a **workflow helper** (not on `createAgent`).

All committed tool outcomes must appear as **tool** role messages in the store.

### `AgentRunResult.toolCalls` (optional)

If exposed, it should be derived from the last step or from `newMessages` for ergonomics (e.g. `if (result.toolCalls.length) { ... }`), documented as **derived**, not stored separately.

---

## Types and AI SDK compatibility

- Re-export / use `CoreMessage` (alias of `ModelMessage` in v5) and `LanguageModel` from `ai`.
- Re-export `generateText`, `streamText`, `tool` for workflows and advanced use.
- **`agent.run`** and **`agent.stream`**: same `streamText` implementation; `run` drains without exposing streams; observers still get `onStream` / tool hooks — [`streaming-api.md`](./streaming-api.md).

---

## Inspection / events (hook, not agent API)

The runner should emit events (for SQLite / UI) such as:

- `system_persisted` — scope, rendered content (or hash + ref)
- `user_appended`
- `model_request` / `model_response` — message counts, usage
- `messages_committed` — `newMessages` appended

Template metadata (`template.name`, `inputData` snapshot) can attach to events for debugging without re-rendering.

---

## v1 implementation checklist

- [ ] `createAgent` + agent registry metadata (`id`)
- [ ] `MessageStore` interface + `inMemory` (+ optional SQLite later)
- [ ] `agent.run({ memoryScope, user?, messages? })` with system bootstrap + persist
- [ ] Commit `result.response.messages` to store
- [ ] Template ref + `renderPromptTemplate` integration in runner
- [ ] Defer public **memory pipeline** API ([`memory-pipeline.md`](./memory-pipeline.md))

---

## Open items (workflows / project)

- Default `memoryScope` generation from `WorkflowContext` (per step vs per agent invocation).
- Whether `user` is required on every `run()` after the first turn.
- Tool `execute` on agent vs workflow-owned execution.
- `agent.stream` + run event sink (see [`streaming-api.md`](./streaming-api.md)).
