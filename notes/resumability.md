# Resumability (draft)

What “resume” means in ADL, and which stores participate. **Not implemented** in v1; this clarifies dependencies between [`message-store.md`](./message-store.md) and [`observability-api.md`](./observability-api.md).

---

## “Resume” is not one feature

| Scenario | What the user wants | Primary store | Observability role |
|----------|---------------------|---------------|-------------------|
| **A. Continue a conversation** | Same chat, next message | **`MessageStore`** | Optional history in UI |
| **B. Retry a failed workflow** | Run again from start or from a step | **Observability** (+ workflow code) | Step outputs, run input |
| **C. Durable workflow (crash mid-run)** | Pick up after process death | **Observability + checkpoints** (future) | Source of truth for progress |
| **D. Inspection replay** | Watch past run in UI | **Observability** only | Full event log |
| **E. Time-travel debugging** | Re-execute from step N | Observability + explicit APIs | Not automatic in v1 |

Do not assume one store solves all of these.

---

## A. Conversational resume → **memory store**

If `memoryScope` is unchanged, the next `agent.run` **loads** the transcript (system, user, assistant, tool messages) and continues.

- **Does not require** observability to be enabled.
- **Does not require** the same `runId` — a new workflow run can continue an old conversation scope.
- Observability may **display** past runs that touched that scope, but the model only reads **`MessageStore`**.

```ts
// New workflow run, same conversation
await researcher.run({
  memoryScope: `user:${userId}:thread:${threadId}`,
  user: "Follow up question",
});
```

---

## B. Retry / logical resume → **mostly observability**

To retry “from step `search`” without re-running `outline`:

1. **Observability** must have recorded:
   - `run_started` with workflow **input**
   - `step_finished` for completed steps with **serialized outputs** (JSON-safe return values)
   - `step_failed` at the failure point
2. **Workflow code** must be written to **accept injected prior results** (explicit parameters, not magic closure replay).

The **memory store** does not know about workflow steps. It only knows **agent** transcripts per `memoryScope`.

**Agent memory** may still matter on retry: if `search` used `memoryScope: "…:search"`, that scope already has tool results in **`MessageStore`**—resuming the agent might mean “continue that scope” vs “clear and redo.” That is a **project policy**, not automatic.

---

## C. Durable / crash resume → **observability + (future) checkpoints**

After a crash, nothing in-process survives. You need **persisted** data:

| Data | Where |
|------|--------|
| Run id, workflow id, input | `run_started` event / `RunReader` |
| Completed steps + outputs | `step_finished` events |
| Active step at failure | Last `step_started` without matching finish |
| Agent conversations in flight | **`MessageStore`** per `memoryScope` (if agents ran before crash) |
| Arbitrary workflow variables | **Not in v1** — closures are not persisted |

**Observability alone** is enough to *inspect* where a run stopped and to *manually* or *programmatically* start a compensating run. **Automatic** resume (re-enter workflow mid-function) needs one of:

- **Deterministic re-execution** from the top with **skip** logic driven by observability (idempotent steps + read prior `step_finished`), or
- **Explicit checkpoints** (future API): `ctx.checkpoint({ ... })` writing workflow state to a store, or
- External durable execution (e.g. AI SDK Workflow / Temporal) — out of core v1 scope.

We do **not** plan v1 “replay the closure” from observability.

---

## D. UI replay → **observability only**

The inspection UI rebuilds waterfalls from **run events**. **`MessageStore`** is not required for replay if `messages_committed` (or agent events) captured enough for display. For full transcript fidelity, link UI to **memoryScope** + `MessageStore` or store message snapshots in events.

---

## Dual-write on agent finish (both stores)

When an agent episode completes during a workflow:

```
MessageStore.save(scope, messages)     ← required for model continuity
observers.onMessagesCommitted(...)     ← UI / audit
```

**Resume conversation** after crash: memory may already have partial tool messages if `save` happened before crash; otherwise last committed state wins.

**Resume workflow**: use observability step outputs; per-agent scopes may already have partial transcripts in memory.

---

## Recommended v1 stance

| Capability | v1 |
|------------|-----|
| Multi-turn agent via `memoryScope` | Yes — **MessageStore** |
| List / inspect past runs | Yes — **`WorkflowStore`** (not observers) |
| Manual retry with new run + same input | Yes — user/CLI |
| Auto resume workflow mid-execution | **No** — document patterns (idempotent steps, read prior events) |
| Checkpoints / `ctx.checkpoint` | **Deferred** |

---

## Future: checkpoints (optional third piece)

If automatic workflow resume becomes a requirement:

```ts
interface WorkflowCheckpointStore {
  save(runId: string, snapshot: WorkflowSnapshot): Promise<void>;
  load(runId: string): Promise<WorkflowSnapshot | null>;
}
```

`WorkflowSnapshot` might include: input, completed step ids + outputs, map of `memoryScope` → message list refs. Could be implemented **on top of** observability events (projection) or a dedicated table. Still **not** a replacement for **`MessageStore`** for model prompts.

---

## Summary

- **Memory store** → resumability of **conversations** (what the model remembers).
- **Observability** → resumability of **runs** (what happened, step outputs, replay UI, retry orchestration).
- **Both** matter when a crashed run had already committed agent messages and finished steps.
- Neither alone gives **transparent** resume of arbitrary TypeScript workflow state — that needs idempotent design, explicit inputs, and eventually checkpoints.

Cross-links: [`message-store.md`](./message-store.md), [`observability-api.md`](./observability-api.md), [`workflow-api.md`](./workflow-api.md).
