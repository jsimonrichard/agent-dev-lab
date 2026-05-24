# Resumability (draft)

What “resume” means in ADL, and which stores participate. **Not implemented** in v1; this clarifies dependencies between [`message-store.md`](./message-store.md) and [`observability-api.md`](./observability-api.md).

---

## “Resume” is not one feature

| Scenario                                | What the user wants                 | Primary store                              | Observability role           |
| --------------------------------------- | ----------------------------------- | ------------------------------------------ | ---------------------------- |
| **A. Continue a conversation**          | Same chat, next message             | **`MessageStore`**                         | Optional history in UI       |
| **B. Retry a failed workflow**          | Run again from start or from a step | **`WorkflowStore`** (+ workflow code)      | Step outputs, run input      |
| **C. Durable workflow (crash mid-run)** | Pick up after process death         | **`WorkflowStore` + checkpoints** (future) | Source of truth for progress |
| **D. Inspection replay**                | Watch past run in UI                | **`WorkflowStore`** only                   | Full event log               |
| **E. Time-travel debugging**            | Re-execute from step N              | Observability + explicit APIs              | Not automatic in v1          |

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

## Step atomicity (why mid-workflow resume is hard)

A **`ctx.step` callback is one atomic unit** from the framework’s point of view. On retry or resume, ADL can only:

- **Skip** a step entirely (if a prior `recordStepComplete` exists and your workflow reads that output), or
- **Re-run** the whole callback from the first line.

There is **no** safe way to resume “halfway through” a step body—e.g. custom logic → `agent.run` → more logic—without re-executing the preamble.

```ts
await ctx.step("search", async ({ ctx }) => {
  const files = await listFiles(); // runs again on step retry
  const prompt = buildPrompt(files); // runs again
  const out = await agent.run({ user: prompt });
  await uploadSummary(out); // might run again — dangerous if not idempotent
});
```

**Implications:**

| Practice                                             | Why                                                              |
| ---------------------------------------------------- | ---------------------------------------------------------------- |
| Put **side effects** in their own steps              | So retry can **skip** the step via stored **output**             |
| Put **non-idempotent** work behind explicit guards   | Or accept that retry duplicates it                               |
| Pass prior step outputs as **arguments**             | Useful across new runs; same-run retry uses `getStepOutput` skip |
| Treat **one agent call per step** when retry matters | Clear boundary for store + memory                                |

**Mid-conversation inside a workflow** usually means: same **`memoryScope`** across a retry, not “resume the same step halfway.” Conversation continuity is **`MessageStore`**; step retry is **`WorkflowStore`** step outputs.

---

## B. Retry / logical resume → **`WorkflowStore`**

To retry “from step `search`” without re-running `outline`:

1. **`WorkflowStore`** must have recorded:
   - Run **`input`** and (when finished) run **`output`**
   - Per-step **`output`** (and optional `input` snapshot) for completed steps
   - `step_failed` at the failure point
2. **Runtime skip:** on retry with the same `runId`, **`ctx.step`** calls `getStepOutput` and **returns the stored output without running the callback** (see [`workflow-api.md`](./workflow-api.md)). No per-step manual early-return boilerplate in user TS for the common case.
3. **Workflow code** still must be **idempotent** for work _outside_ `ctx.step` (top-level `run` body, code between steps).

The **memory store** does not know about workflow steps. It only knows **agent** transcripts per `memoryScope`.

**Agent memory** may still matter on retry: if `search` used `memoryScope: "…:search"`, that scope already has tool results in **`MessageStore`**—resuming the agent might mean “continue that scope” vs “clear and redo.” That is a **project policy**, not automatic.

---

## C. Durable / crash resume → **observability + (future) checkpoints**

After a crash, nothing in-process survives. You need **persisted** data:

| Data                          | Where                                                             |
| ----------------------------- | ----------------------------------------------------------------- |
| Run id, workflow id, input    | `recordRunStart` / `getRun`                                       |
| Completed steps + outputs     | `step_finished` events                                            |
| Active step at failure        | Last `step_started` without matching finish                       |
| Agent conversations in flight | **`MessageStore`** per `memoryScope` (if agents ran before crash) |
| Arbitrary workflow variables  | **Not in v1** — closures are not persisted                        |

**WorkflowStore alone** is enough to _inspect_ where a run stopped and to _manually_ or _programmatically_ start a compensating run. **Automatic** resume (re-enter workflow mid-function) needs one of:

- **Deterministic re-execution** from the top with **skip** logic driven by observability (idempotent steps + read prior `step_finished`), or
- **Explicit checkpoints** (future API): `ctx.checkpoint({ ... })` writing workflow state to a store, or
- External durable execution (e.g. AI SDK Workflow / Temporal) — out of core v1 scope.

We do **not** plan v1 “replay the closure” from observability.

---

## D. UI replay → **`WorkflowStore` only**

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

| Capability                                       | v1                                                                                      |
| ------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Multi-turn agent via `memoryScope`               | Yes — **MessageStore**                                                                  |
| List / inspect past runs                         | Yes — **`WorkflowStore`** (not observers)                                               |
| Manual retry with new run + same input           | Yes — user/CLI                                                                          |
| Auto resume workflow mid-execution               | **Partial** — same-`runId` **step skip** via stored output; no mid-step callback resume |
| Agent episode cache (`cacheable` on `agent.run`) | **Future** — opt-in; skip LLM only when fingerprint hits                                |
| Mid-stream token resume                          | **No** — not v1                                                                         |
| Checkpoints / `ctx.checkpoint`                   | **Deferred**                                                                            |

---

## Agent re-run vs mid-agent resume

### Re-run the agent from the beginning (default)

When a **step retries**, `agent.run` typically runs again with:

- Fresh closure work (unless you split steps), and
- **`MessageStore.load(memoryScope)`** — may already contain system, user, assistant, and tool messages from the **failed attempt**.

That is **conversation resume** (model sees prior turns), not **skipping** the LLM call. Often correct after a crash mid-episode: you may want the model to continue or redo the last turn, not skip it.

**Policy choices** (project-defined, not automatic):

| Policy             | Behavior on step retry                            |
| ------------------ | ------------------------------------------------- |
| **Continue scope** | Same `memoryScope`; load existing transcript      |
| **Fork scope**     | New `memoryScope` suffix per attempt (`:retry-1`) |
| **Clear scope**    | Wipe store for that scope before `agent.run`      |

### Mid-agent resume (same step, same generation)

**True** mid-stream resume (stop after 500 tokens, later continue the same completion) is **fragile** (provider/SDK support, partial assistant message in store) and **not** a v1 ADL goal.

What _does_ make sense as an **optional optimization**:

### Agent episode cache (future — not v1)

Episode deduplication is **deferred**. When added, it must be **opt-in per call** because agents can perform **side-effect work** in `execute` (tools) that must run again if prior custom logic re-ran—even when the message list fingerprint matches.

```ts
await agent.run({
  memoryScope,
  user: prompt,
  cacheable: true, // future: allow lookup/store in episode cache; default false
});
```

- **`cacheable: false` (default):** always call the model; tools always run as usual.
- **`cacheable: true`:** if fingerprint of messages-to-model matches a stored episode, return cached result and **skip** `streamText` (tool side effects in that episode would **not** re-run — only safe when the agent is a pure function of messages or tools are idempotent).

Still does not skip **custom TS** before `agent.run` inside a step—only the LLM episode.

### Agent episode cache — behavior sketch (future)

Before calling the model, the runner hashes the **exact messages** sent to the API (and optionally `agentId` + tool set version), **only when `cacheable: true`**:

```ts
fingerprint = hash(stableSerialize(messagesForModel));

if (await agentEpisodeCache.get(fingerprint)) {
  return cachedResult; // skip streamText
}
const result = await executeAgentEpisode(...);
await agentEpisodeCache.set(fingerprint, result);
```

**When this helps:**

- Step **re-runs** and precall logic is **deterministic** → same `messages` → **skip redundant LLM** (cost/latency), even though precall still executed.
- Explicit **retry** of a failed run where nothing about the prompt changed.

**When it does not help:**

- Precall changes messages every time (timestamps, random ids) → fingerprint miss → full model call anyway.
- You still need **idempotent** side effects outside the cache (uploads, DB writes).

**Where to store cache:**

- **`WorkflowStore`** extension (`recordAgentEpisode` + lookup by fingerprint), or
- Separate **`AgentEpisodeCache`** interface — not the observer layer.

**Not the same as `MessageStore`:** memory holds the canonical transcript; cache holds **optional** `(fingerprint → last result)` for deduplication. On cache hit you may still append to memory if the failed run never committed.

**“Exactly the same input messages”** is the right key for _skip model call_. It does **not** fix re-running custom TS before `agent.run`—only **finer steps** or **idempotent** precall do.

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
- **`WorkflowStore`** → resumability of **runs** (step outputs, replay UI, retry orchestration).
- **Both** matter when a crashed run had already committed agent messages and finished steps.
- Neither alone gives **transparent** resume of arbitrary TypeScript workflow state — that needs idempotent design, explicit inputs, and eventually checkpoints.

Optional **`WorkflowResumer`** reads the store — see [`observability-api.md`](./observability-api.md). Observers alone are insufficient for resume.

Cross-links: [`memory-store.md`](./message-store.md), [`observability-api.md`](./observability-api.md), [`workflow-api.md`](./workflow-api.md).
