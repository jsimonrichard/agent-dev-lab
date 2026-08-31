# Future extensions & hooks (draft)

**Status:** Not v1. Captures direction for hooks, human approval, and a possible **extension system** so the small core stays small while research projects can add RAG, guardrails, and custom policy.

Related: [agents guide](../apps/docs/src/content/docs/core/agents.md), [workflows guide](../apps/docs/src/content/docs/core/workflows.md), [project config](../apps/docs/src/content/docs/core/project.md), [`MessageStore`](../packages/core/src/stores/types.ts), [`memory-pipeline.md`](./memory-pipeline.md).

**Explicitly out of scope here:** evals / scorers (no ADL primitive planned; use external tools + observers if needed).

---

## Why extensions (eventually)

Today ADL splits concerns cleanly:

| Layer               | Role                                       |
| ------------------- | ------------------------------------------ |
| **`MessageStore`**  | Model conversation state                   |
| **`WorkflowStore`** | Run/step I/O + events for UI and step skip |
| **Observers**       | Push-only telemetry                        |

Several cross-cutting features want the **same** integration points (messages in/out, run context, optional persist boundaries):

- Pre/post **model** message shaping (trimming, injection, guardrails)
- Pre/post **persist** hooks (redaction, audit, extra indexes)
- **Human approval** (tools and workflow steps)
- **RAG** (retrieve → inject as messages or tool results)

Rather than ad-hoc one-off APIs for each, a future **`Extension`** (or small set of hook interfaces) could register on the project and run in a defined order.

```ts
// Sketch — not implemented
interface AdlExtension {
  id: string;
  onBeforeModelCall?(ctx: ModelHookContext): Promise<ModelMessage[] | void>;
  onAfterModelCall?(ctx: ModelHookContext): Promise<void>;
  onBeforePersist?(ctx: PersistHookContext): Promise<ModelMessage[] | void>;
  onAfterPersist?(ctx: PersistHookContext): Promise<void>;
}
```

`ModelHookContext` would expose: `memoryScope`, `agentId`, `messages` (mutable copy or replace), `runId`, `stepId`, `abortSignal`, read-only `context`.

`PersistHookContext` would expose: `memoryScope`, `newMessages`, store handle (or forbid direct store access and only allow return value replacement).

**v1:** no extension registry — only design notes. [`memory-pipeline.md`](./memory-pipeline.md) remains the placeholder for _one_ pre-model pipeline until extensions exist.

---

## Pre/post model hooks

**Before model:** transform the message list immediately before `streamText` / structured output call (after load + system bootstrap + user append). Use cases:

- Last-N truncation, summarization
- Inject retrieved chunks (RAG extension)
- Policy / PII stripping

**After model:** inspect or mutate the episode before persistence (rare; prefer before-persist for anything that must land in the store).

Hooks should **not** replace `MessageStore` — they operate on the in-flight list for a single episode unless they explicitly call store APIs (discouraged; prefer return value).

---

## Pre/post persist hooks

**Before persist:** redact secrets from `newMessages`, split large tool results, attach metadata.

**After persist:** secondary indexes, webhooks, analytics — must not block the critical path without explicit async queue (project choice).

These hooks see **`ModelMessage[]`** in the same shape committed to [`MessageStore`](../packages/core/src/stores/types.ts).

---

## Human approval (future)

Two surfaces:

### 1. AI SDK tool approval

When the AI SDK supports **`needApproval`** (or equivalent) on tools, ADL should forward approval requests to the project **`approvals`** config (see [project config](../apps/docs/src/content/docs/core/project.md)) so the same dispatcher handles SDK tool gates and workflow gates.

### 2. Workflow `ctx.requestApproval`

For non-tool pauses (step boundaries, arbitrary checkpoints):

```ts
await ctx.requestApproval({
  message: "Publish summary to shared drive?",
  metadata?: Record<string, unknown>;
});
// Resolves when dispatcher approves; rejects on deny / timeout (policy TBD)
```

**Resume:** approval wait implies a **persisted run state** (`WorkflowStore` run status `waiting_approval`) and a way to **resume** the run after approval (future `workflow.resume` or external trigger). Not v1.

### Project `approvals` config (sketch)

```ts
export interface AdlProjectConfig {
  approvals?: {
    /** Deliver request to UI, Slack, CLI, etc. */
    dispatcher: ApprovalDispatcher;
  };
}

interface ApprovalDispatcher {
  request(req: ApprovalRequest): Promise<ApprovalDecision>;
}
```

The inspection UI can implement a dispatcher that blocks on in-app buttons; headless tests can use `autoApprove: true`.

---

## RAG as an extension (future)

Not a core ADL package in v1. A plausible extension:

1. **`onBeforeModelCall`**: read `context` (e.g. `resourceId`, query from last user message), call vector store, append retrieved content as a **user** or **system** message (project convention).
2. Optional **tool** that wraps the same retriever for agent-driven search.

Keeps core runtime free of vector DB dependencies; playground can ship an example extension later.

---

## Relationship to Mastra-style processors

Mastra **processors** on agents overlap with **pre-model** hooks. ADL defers a unified story until extension ordering, failure modes, and interaction with **structured output** are clear. See comparison in prior design discussion — prefer one extension model over many partial APIs.

---

## Non-goals (extensions track)

- Built-in **evals / scorers** — use external harnesses; optional observer export only
- Hosted approval SaaS — project implements `dispatcher`
- Automatic **workflow** replay from closure state — still [`resumability.md`](./resumability.md) (step I/O + skip)

---

## Standalone core HTTP API (deferred)

`@agent-dev-lab/core` is a **library** in 0.0.1. CLI and the inspection UI are the hosts that load a project and call `workflow.run` / `agent.run`.

A later release can add a **process host export** (same package, e.g. `@agent-dev-lab/core/server`) that serves agents and workflows over HTTP/SSE — not a second runtime package.

- [ ] Defer standalone API server

## v1

- [x] Document only (this file + cross-links)
- [x] Ship **structured output** on agents without extensions ([agents guide](../apps/docs/src/content/docs/core/agents.md))
- [x] Ship **`WorkflowStore`** run/step I/O ([`WorkflowStore`](../packages/core/src/observability/workflow-store.ts))
- [ ] Defer `ctx.requestApproval`, extension registry, RAG package
