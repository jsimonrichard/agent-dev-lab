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

## Stateful code-execution tool (future)

Not the same thing as the `bash` tool's own long-running-command fast-follow (Mastra-style
`execute_command`/`get_process_output`/`kill_process` over a process registry, sketched in
[`tool-sandboxing.md`](./tool-sandboxing.md)'s Bash tool section) — this is a **persistent
interpreter/kernel** (e.g. a Python/Jupyter kernel) that a research-oriented agent can send
successive snippets to, keeping variables/imports alive across calls within one run, rather than
each `bash` invocation being a fresh, stateless process. Motivated by the "not only coding"
half of `@agent-dev-lab/tools`'s intended audience — quick data analysis, numeric checks,
plotting — where re-establishing state every call is real friction a one-shot `bash` tool
doesn't have for shell commands.

**Why this is deferred here rather than added to `tool-sandboxing.md` as a fourth tool family:**
unlike file/bash/web-search/grep/fetchUrl, a kernel has a **lifecycle that outlives a single tool
call** — it needs to be started once per run (or per conversation) and torn down deterministically
when that run ends, which is exactly the kind of run-scoped resource management
`packages/tools`' per-call `ToolProvider` pattern doesn't currently address (today's providers are
stateless factories called fresh each time; nothing in `@agent-dev-lab/core` currently gives a
provider a "run started" / "run ended" hook to hang kernel start/stop off of). Building this
properly is a **core API addition** — some notion of run-scoped resource lifecycle, not just a new
sandboxed tool — so it belongs in this file alongside the other core-surface extensions rather
than being scoped as more `packages/tools` work. Concretely still open:

- Where the kernel process itself is sandboxed (reuse `BashExecutor`'s tiers, or a dedicated
  primitive — a long-lived process is a different isolation problem than a one-shot command).
- What "run ended" means precisely for cleanup purposes — ties into the same open shutdown-hook
  gap `tool-sandboxing.md` flags for `SandboxManager.reset()` (no framework-level shutdown hook
  exists today for _any_ per-run resource, not just this one).
- One kernel per run vs. per conversation vs. pooled/shared — affects both isolation and cost.

**v1 for this item:** design notes only, same as everything else in this file — no
implementation planned until the run-scoped-resource question above has an answer that isn't
specific to this one tool.

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

---

## Entity tables as views instead of hand-written projections (deferred)

Today the read models over the event log are maintained by hand, in two places
that both have to stay in step with the log:

- [`db/projections/`](../packages/core/src/db/projections/) folds each
  `RunEvent` into `adl_agent_episodes`, `adl_conversation_metadata`,
  `adl_workflow_runs` and `adl_step_records`.
- [`db/backfill.ts`](../packages/core/src/db/backfill.ts) replays retained
  events through that same code to populate a table added after a database
  already exists, keyed in `adl_schema_migrations` so it runs once.

Both exist only because the tables are _stored_. If a read model were a query
over `adl_run_events` instead, there would be no projection to write and no
backfill to run — a new read model would be available over all history the
moment it was defined.

**What is actually available on SQLite** (checked, not assumed):

- No `CREATE MATERIALIZED VIEW` — it is a syntax error. The literal feature
  does not exist on today's backend.
- A plain `CREATE VIEW` _can_ express the fold, including state assembled from
  more than one event: a view grouping on
  `json_extract(payload_json, '$.agentCallId')` derives an episode's agent from
  its `agent_started` and its `finished_at` from the matching `agent_finished`.
- Indexes on `json_extract(...)` expressions are supported, and a `VIRTUAL`
  generated column over a JSON field can be added with `ALTER TABLE` and then
  indexed. So the `WHERE` / `ORDER BY` / `LIMIT` pushdown `listAgentEpisodes`
  now relies on would not have to be surrendered. (`STORED` generated columns
  cannot be added by `ALTER TABLE`; that needs a table rebuild.)

**Where it fits, and where it does not.** This is not uniform across the four
tables, which is the main thing to know before starting:

- `adl_agent_episodes` is the good candidate. It is a pure fold of
  `agent_started` / `agent_finished` / `agent_failed` with no writer outside
  the projection, so a view plus an expression index could replace both its
  projection and its backfill outright.
- `adl_conversation_metadata` cannot be a view as it stands. SQLite rejects
  `UPDATE` against a view, and this table carries columns no event produces —
  `deleted_at`, and the `agent_call_id` / `fork_json` the inspection UI writes
  directly. Expressing it as a view would mean `INSTEAD OF` triggers, which
  trades hand-written TypeScript for hand-written SQL rather than removing the
  mechanism.
- `adl_workflow_runs` and `adl_step_records` have the same objection, via
  `setRunTitle` / `setRunTags`.

**The cost to weigh.** A non-materialized view recomputes on read.
`listAgentEpisodes` was rewritten in this lane specifically to stop
`JSON.parse`-ing the entire log on every call, so adopting a view _without_ the
expression indexes above would walk that straight back. The honest version of
this change is "view + indexes", not "view".

If the store ever gains a backend with real materialized views (Postgres,
libSQL), the calculus shifts: true storage plus `REFRESH` semantics would let
the episodes table drop both mechanisms with no read-cost regression, and would
make the same treatment plausible for the mixed-ownership tables if their
UI-written columns moved into the log as events first.

- [ ] Defer view-backed read models; revisit for `adl_agent_episodes` first,
      and whenever the SQLite-only assumption is relaxed

## v1

- [x] Document only (this file + cross-links)
- [x] Ship **structured output** on agents without extensions ([agents guide](../apps/docs/src/content/docs/core/agents.md))
- [x] Ship **`WorkflowStore`** run/step I/O ([`WorkflowStore`](../packages/core/src/observability/workflow-store.ts))
- [ ] Defer `ctx.requestApproval`, extension registry, RAG package, stateful code-execution tool
