# Resumability (draft)

**Resume** in ADL means **re-entering a workflow run** after failure (and, later, after a crash): skip completed `ctx.step` callbacks via stored outputs, re-run the rest. That is a [`WorkflowStore`](../packages/core/src/observability/workflow-store.ts) concern. Same-`runId` **step skip** is implemented; mid-closure replay and crash-safe re-entry are not.

[`MessageStore`](../packages/core/src/memory/types.ts) is **not** a resume mechanism. It holds the conversation transcript for a `memoryScope`. The next `agent.run` with that scope **loads** the list, appends the new turn, and **saves** — ordinary chat memory, independent of workflow retry. See the [agents guide](../apps/docs/src/content/docs/core/agents.md#memoryscope).

The stores **interact** when a retried step calls `agent.run` again: skip uses `WorkflowStore`; the agent still **loads** whatever `MessageStore` already has for that scope. Choose continue / fork / clear explicitly. Do not treat that load as “the run resumed.”

User-facing spec for step skip: [workflows guide — Resumability](../apps/docs/src/content/docs/core/workflows.md).

---

## What resume covers

| Scenario                             | What the user wants                 | Primary store                              | Status                    |
| ------------------------------------ | ----------------------------------- | ------------------------------------------ | ------------------------- |
| **Retry a failed workflow**          | Run again from start or from a step | **`WorkflowStore`** (+ workflow code)      | Same-`runId` step skip    |
| **Durable workflow (crash mid-run)** | Pick up after process death         | **`WorkflowStore` + checkpoints** (future) | Not v1                    |
| **Inspection replay**                | Watch past run in UI                | **`WorkflowStore`** only                   | Event log (not execution) |
| **Time-travel debugging**            | Re-execute from step N              | Observability + explicit APIs              | Not automatic in v1       |

Multi-turn chat (same `memoryScope`, next user message) is **memory**, not a row in this table.

---

## Not resume: `MessageStore`

If `memoryScope` is unchanged, the next `agent.run` loads the transcript (system, user, assistant, tool messages) and appends this turn.

- Does not require observability.
- Does not require the same `workflowRunId` — a new workflow run, or no workflow at all, can share a scope.
- Observability may **display** past runs that touched that scope; the model only reads **`MessageStore`**.

```ts
await researcher.run({
  memoryScope: `user:${userId}:thread:${threadId}`,
  user: "Follow up question",
});
```

That is the same load/append/save path as the first turn. Documented under [memoryScope](../apps/docs/src/content/docs/core/agents.md#memoryscope), not as a resume API.

---

## Step atomicity (why mid-workflow resume is hard)

A **`ctx.step` callback is one atomic unit** from the framework’s point of view. On retry, ADL can only:

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

A retried step that calls an agent with the **same `memoryScope`** will **load the existing transcript** (memory). That is not “resume the step halfway.”

---

## Retry / logical resume → **`WorkflowStore`**

To retry “from step `search`” without re-running `outline`:

1. **`WorkflowStore`** must have recorded:
   - Run **`input`** and (when finished) run **`output`**
   - Per-step **`output`** (and optional `input` snapshot) for completed steps
   - `step_failed` at the failure point
2. **Runtime skip:** on retry with the same `runId`, **`ctx.step`** calls `getStepOutput` and **returns the stored output without running the callback** (see [workflows guide](../apps/docs/src/content/docs/core/workflows.md)). No per-step manual early-return boilerplate in user TS for the common case.
3. **Workflow code** still must be **idempotent** for work _outside_ `ctx.step` (top-level `run` body, code between steps).

**`MessageStore` does not know about workflow steps.** It only knows agent transcripts per `memoryScope`.

If the retried step runs and calls `agent.run` with `memoryScope: "…:search"`, that scope may already have messages from the failed attempt. What the model sees is a **project policy**, not automatic resume:

| Policy             | Behavior on step retry                            |
| ------------------ | ------------------------------------------------- |
| **Continue scope** | Same `memoryScope`; load existing transcript      |
| **Fork scope**     | New `memoryScope` suffix per attempt (`:retry-1`) |
| **Clear scope**    | Wipe store for that scope before `agent.run`      |

---

## Durable / crash resume → **observability + (future) checkpoints**

After a crash, nothing in-process survives. You need **persisted** data:

| Data                            | Where                                                             |
| ------------------------------- | ----------------------------------------------------------------- |
| Run id, workflow id, input      | `recordRunStart` / `getRun`                                       |
| Completed steps + outputs       | `step_finished` events                                            |
| Active step at failure          | Last `step_started` without matching finish                       |
| Agent transcripts already saved | **`MessageStore`** per `memoryScope` (if `save` ran before crash) |
| Arbitrary workflow variables    | **Not in v1** — closures are not persisted                        |

**WorkflowStore alone** is enough to _inspect_ where a run stopped and to _manually_ or _programmatically_ start a compensating run. **Automatic** resume (re-enter workflow mid-function) needs one of:

- **Re-execution** from the top with **skip** logic driven by stored step outputs (idempotent steps + read prior `step_finished`), or
- **Explicit checkpoints** (future API): `ctx.checkpoint({ ... })` writing workflow state to a store, or
- External durable execution (e.g. AI SDK Workflow / Temporal) — out of core v1 scope.

We do **not** plan v1 “replay the closure” from observability.

---

## UI replay → **`WorkflowStore` only**

The inspection UI rebuilds waterfalls from **run events**. **`MessageStore`** is not required for replay if `messages_committed` (or agent events) captured enough for display. For full transcript fidelity, link UI to **memoryScope** + `MessageStore` or store message snapshots in events.

---

## Dual-write on agent finish (both stores)

When an agent episode completes during a workflow:

```
MessageStore.save(scope, messages)     ← required for the next agent episode
observers.onMessagesCommitted(...)     ← UI / audit
```

After a crash, **memory** is whatever `save` last committed (possibly partial tool messages). **Run retry** uses observability step outputs; per-agent scopes may already have transcripts in `MessageStore`.

---

## Recommended v1 stance

| Capability                                       | v1                                                                                      |
| ------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Multi-turn agent via `memoryScope`               | Yes — **`MessageStore`** (memory, not resume)                                           |
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

That is **memory** (model sees prior turns), not **skipping** the LLM call. Often correct after a crash mid-episode: you may want the model to continue or redo the last turn, not skip it. Policies: continue / fork / clear scope (table above).

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

- **`MessageStore`** → conversation transcript for the next `agent.run` (memory). Not a restore of workflow state.
- **`WorkflowStore`** → run retry (step skip), UI replay, later crash resume.
- Both can apply on a retried step that calls an agent; they still answer different questions.
- Neither gives **transparent** resume of arbitrary TypeScript workflow state — that needs idempotent design, explicit inputs, and eventually checkpoints.

Optional **`WorkflowResumer`** reads the store — see [`WorkflowStore`](../packages/core/src/observability/workflow-store.ts). Observers alone are insufficient for resume.

Cross-links: [`MessageStore`](../packages/core/src/memory/types.ts), [`WorkflowStore`](../packages/core/src/observability/workflow-store.ts), [workflows guide](../apps/docs/src/content/docs/core/workflows.md), [agents — memoryScope](../apps/docs/src/content/docs/core/agents.md#memoryscope).
