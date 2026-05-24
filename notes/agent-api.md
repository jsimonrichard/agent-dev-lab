# Agent API (draft)

Design notes for the first ADL **agent** surface in `@agent-dev-lab/runtime`. Workflows, project registry, and the memory pipeline are separate; this doc focuses on agents, templates, and message persistence.

**Status:** Agreed direction for v1 implementation planning. Not yet implemented in code.

## Goals

- **TypeScript-first**, headless, AI SDK–native (`ModelMessage` / `CoreMessage`, `generateText`, `tool()`).
- **Agents** = one model episode per `run()` (no multi-step tool loop config on the agent; workflows own loops in plain TS).
- **Templates** stay pure (`render → string`); the agent runner decides role and persistence.
- **Memory** = scoped message lists; tool calls and results live **in** the list as messages, not in a parallel store.

## Related docs

- Project principles: [`design-overview.md`](./design-overview.md)
- Deferred memory shaping: [`memory-pipeline.md`](./memory-pipeline.md)

---

## `defineAgent`

An agent is a reusable configuration: identity (instructions), model, tools, memory store binding, and optional defaults.

```ts
import { defineAgent, template } from "@agent-dev-lab/runtime";

export const researcher = defineAgent({
  id: "researcher",

  /** Rendered once per new conversation scope; persisted as a system message. */
  instructions: template("./researcher.md"),

  model: openai("gpt-4o"),

  tools: {
    search: tool({ /* AI SDK tool */ }),
  },

  /**
   * Optional. When omitted, the project/runtime default store is used.
   * Pipeline / lastMessages presets are deferred — see memory-pipeline.md.
   */
  memory: {
    store: defaultMessageStore(),
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
| Each `run()` | `user` (typical) | Caller `user` string or workflow `render(stepTemplate, data)` → append → persist after call |

Workflows should not re-bootstrap system prompts. They pass turn input; the agent owns standing instructions.

---

## Memory scope

### Why not `thread` + `resource`?

Frameworks like Mastra use separate **thread** (one conversation) and **resource** (e.g. user) ids so working memory and semantic recall can be shared across threads. That is useful but adds API surface before we need it.

### v1: `memoryScope: string`

A single opaque key selects the message list in the store. The caller (usually the workflow) builds the string:

```ts
// Examples — conventions are project-defined, not enforced by ADL
`run:${runId}:step:outline`
`user:${userId}:chat:${chatId}`
`${runId}:researcher`
```

Same agent + same `memoryScope` → shared history. New scope → new conversation (new system bootstrap when store is empty).

If we later need first-class cross-thread sharing, we can add optional helpers (e.g. `forkScope`, `parentScope`) without breaking string scopes.

---

## `agent.run()`

```ts
type AgentRunInput = {
  /** Selects the message list in the store. */
  memoryScope: string;

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
5. `generateText({ model, tools, messages })` (and `system` only if not already in `messages`—prefer messages-only for one source of truth)
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
3. Next `run()` on the **same** `memoryScope` with more `user` / `messages`, or a single SDK call with `stopWhen` inside a **workflow helper** (not on `defineAgent`).

All committed tool outcomes must appear as **tool** role messages in the store.

### `AgentRunResult.toolCalls` (optional)

If exposed, it should be derived from the last step or from `newMessages` for ergonomics (e.g. `if (result.toolCalls.length) { ... }`), documented as **derived**, not stored separately.

---

## Types and AI SDK compatibility

- Re-export / use `CoreMessage` (alias of `ModelMessage` in v5) and `LanguageModel` from `ai`.
- Re-export `generateText`, `streamText`, `tool` for workflows and advanced use.
- `stream()` on agents can mirror `run()` later; same persistence rules on finish.

---

## Inspection / events (hook, not agent API)

The runner should emit events (for SQLite / UI) such as:

- `system_persisted` — scope, rendered content (or hash + ref)
- `user_appended`
- `model_request` / `model_response` — message counts, usage
- `messages_committed` — `newMessages` appended

Template metadata (`templateId`, `data` snapshot) can attach to events for debugging without re-rendering.

---

## v1 implementation checklist

- [ ] `defineAgent` + agent registry metadata (`id`)
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
- Streaming `agent.stream` parity with persistence on finish.
