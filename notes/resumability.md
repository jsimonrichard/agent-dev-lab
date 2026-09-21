# Resumability

**Resume** in ADL means starting a **new attempt** after failure (or an explicit retry-from-step): still-valid work is **replayed** by returning stored step outputs through `ctx.step` (no callback); work that must run again gets **new run/step IDs** and fresh events. The prior attempt forest stays immutable.

[`MessageStore`](../packages/core/src/stores/types.ts) is **not** a resume mechanism. It holds conversation transcripts per `memoryScope`. See the [agents guide](../apps/docs/src/content/docs/core/agents.md#memoryscope).

User-facing overview: [workflows guide — Resumability](../apps/docs/src/content/docs/core/workflows.md).

---

## Status

| Capability | Status |
| ---------- | ------ |
| Nested runs with own `workflowRunId` + `parentWorkflowRunId` | Shipped (`te7187f90` stack) |
| `parentStepId` on child runs (spawn link) | Required for forest retry |
| Path-stable step output slots | Required (lookup key) |
| `StepOptions.pure` (default true) | Required |
| Attempt lineage (`seedRetryAttempt`, `replayOf*`, `retriesFromRunId`) | Target of this note |
| Same-`runId` in-place mutate | **Superseded** by attempt lineage |
| Crash mid-closure / checkpoints / episode `cacheable` | Deferred |
| Inspector Retry button | Host follow-up |

---

## Nesting model

Each `workflow.run()` gets its own `workflowRunId`. Nested (non-isolated) invocations record:

- `parentWorkflowRunId` — immediate parent run
- `parentStepId` — parent `ctx.stepId` at nest time, or `null` if nested at workflow root

`{ isolated: true }` — no parent link (detach). Used by `titleWorkflow`.

---

## Author contract: step purity

Steps are **pure by default**: they must not mutate captured closures; anything a later step needs must appear in an earlier step’s **output** (or run input).

```ts
await ctx.step("upload", async () => { /* side effect */ }, { pure: false });
```

| Option | Scope | Behavior |
| ------ | ----- | -------- |
| `force: true` | This call only | Bypass skip cache for this invocation |
| `pure: false` | Declared on the step | On every **new attempt** that reaches this path: always re-exec; never skip/copy |

`pure: false` is persisted on step events/records so attempt seeding can see it from the log.

---

## Time-based subsequent (plus amendments)

Given retry target S with end time `T_end` (`step_finished.at` / `step_failed.at`):

Under purity, only steps with **`step_started.at` > `T_end`** could have observed S’s output. Concurrent steps that started before `T_end` stay replayable.

Also re-exec:

1. **S** and its **in-run descendants** (and child runs spawned under S via `parentStepId`)
2. **Path ancestors** of S (and `parentWorkflowRunId` chain + spawning `parentStepId` slots) so the new attempt can re-enter down to S
3. **Time-subsequent** steps across the linked forest (wall-clock)
4. All **`{ pure: false }`** steps the new attempt can reach
5. **Exclude** isolated / no-`parentWorkflowRunId` runs (detach)

---

## Attempt lineage (UX)

| Kind of node in new attempt | Identity | Execution |
| --------------------------- | -------- | --------- |
| Still valid (not in re-exec set) | New row ids + `replayOfRunId` / `replayOfStepId` → prior | Do not run callback; output from prior via seeded cache / `ctx.step` skip |
| Re-exec set | New IDs | Fully re-execute |
| Original attempt | Unchanged | Never rewritten |

New root records `retriesFromRunId` → prior root (or the root of the forest containing the retry target).

**Copy depth:** seed **projections** (run/step summaries + step outputs) and lineage links. Do **not** duplicate full event logs for replayed subtrees; the UI can open the original for detail.

**Isolated:** if a re-executed path calls `helper.run(..., { isolated: true })` again, there is no prior bind → always a fresh run. If the calling step is itself replayed, the isolated call is not reached.

---

## Path-stable step slots

Step output cache keys are the logical **`path`** segments (`name` or `name:key`), not ephemeral `parentStepId` UUIDs. Re-entering an ancestor can still skip prefix siblings.

Addressing change is fail-closed: existing `adl_step_outputs` rows with old UUID-parent keys are cleared on migrate (no dual-read).

---

## API sketch

```ts
const attempt = await store.seedRetryAttempt({
  fromWorkflowRunId, // run containing the target step (or any run in its forest)
  fromStepId,
});
// attempt.newRootRunId, attempt.runIdMap, …

workflow.run(priorInput, {
  workflowRunId: attempt.newRootRunId,
  retryAttempt: attempt,
});
```

Nested `child.run` during an attempt resolves the mapped child id via `(parentWorkflowRunId, parentStepId, workflowId)` against the prior forest / `runIdMap`.

Unknown `fromStepId` → **throw** (no silent no-op).

---

## Not resume: `MessageStore`

Same `memoryScope` on a later `agent.run` is ordinary memory. On step re-exec, choose continue / fork / clear explicitly — the framework does not auto-fork scopes in v1 of attempt lineage.

---

## Deferred

- Crash-safe re-entry without calling `run` again; `ctx.checkpoint`
- Agent episode cache (`cacheable: true`)
- Mid-stream token resume
- Full inspector Retry UI (data model above is the host contract)

---

## Summary

- **`WorkflowStore`** — attempt seed, path-stable outputs, forest queries, UI projections
- **`ctx.step`** — skip via seeded outputs; `pure` / `force`
- **`MessageStore`** — memory only
- Nesting — `parentWorkflowRunId` + `parentStepId`; isolated stays out of cascade
