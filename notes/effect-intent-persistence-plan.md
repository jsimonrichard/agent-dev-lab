# Effect-intent persistence (`effectId` cursors)

**Status:** Shipped (2026-10-12) — emit + `effectId` cursor resolve (step-atomic). Still subject to later project-wide deep review; do not treat shipping this lane as that review.
**Parent:** [`execution-control-plan.md`](./execution-control-plan.md) § Trace cursor + Gaps.
**Blocked by:** nothing. Cross-process unpark was skipped (`abandonLiveRunsLostOnRestart`); this lane is addressable re-entry on a **finished or failed** prior attempt, not mid-closure resume.

**Locked decisions (2026-10-05):**

1. Event names: `effect_intent` / `effect_settled`. Park stays `workflow_suspended` / `workflow_resumed` only. Delete unused `effect_suspended` / `effect_resumed`.
2. Tools emit: required callback on `ToolEffectScope` (not `RunRecorder` import in tools) — fail closed if missing.
3. Root-level `effectId` (`stepId` null): refuse in v1.
4. Model-call intents: deferred.

---

## Goal

Persist every gated `EffectIntent` (and its settled decision / outcome) on the run's append-only event stream so `seedRetryFromCursor({ cursor: { effectId } })` can address a prior attempt the same way `stepId` does today — without inventing a second pause API or growing `WorkflowStore` with a new method family.

---

## Principles

1. **Event log is authoritative.** Intents are `RunEvent`s (same `runSeq` counter as steps). Projections / indexes are optional read models rebuildable by replay — same rule as suspends and step records.
2. **One path for all gate call sites.** Step enter, approval, and tools all go through the same emit-before-gate / emit-after-settle helper. Hosts never special-case `kind`.
3. **Cursor resolve fails closed.** Unknown `effectId` throws. `effectId` + conflicting `stepId` throws. Do not silently fall back to “nearest step.”
4. **v1 replay stays step-atomic.** Resolving an `effectId` maps to the enclosing `stepId` (or run-root boundary) and reuses today's `computeReExecStepIds`. Finer re-entry (replay recorded tool outcomes inside a step) is a later lane — needs model/tool outcome recording that this plan only sketches.
5. **Do not add `WorkflowStore` methods** for lookup. Resolve by `listEvents` (or a projection table fed only via `applyProjections`). Custom stores already implement `listEvents` / `recordEvent`.
6. **No Temporal checkpoint.** Process death still fail-closes live rows. This lane does not revive parked closures.

---

## Reuse survey

| Existing                                              | Role                                                                          | Extend                                                                                                     |
| ----------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `EffectIntent` / `EffectDecision` (`effect/types.ts`) | Gate vocabulary                                                               | Keep; intent `id` becomes `TraceCursor.effectId`                                                           |
| `workflow_suspended` / `workflow_resumed`             | Park + resume on store                                                        | Keep. Suspend already embeds `intent`. Do **not** replace with a second suspend protocol                   |
| `effect_suspended` / `effect_resumed` event types     | Declared in `events.ts`; **never emitted** from core today; UI adapters exist | Either emit them in lockstep with workflow_suspended, or delete/repurpose — one path, no dual pause events |
| `parkingEffectGate` / `createSuspend`                 | Persist park                                                                  | After intent-emitted; resume still `resolveSuspend`                                                        |
| `assertToolAllowed` (tools)                           | Tool gate before execute                                                      | Call shared emit helper (needs a recorder/runSeq source on the effect scope — see § Open)                  |
| `settleStepEnter` / `requestApproval` (context.ts)    | Step + approval intents                                                       | Same helper; they already have `runRecorder`                                                               |
| `seedRetryFromCursor` / `resolveCursorToStep`         | Throws on `effectId`                                                          | Resolve effectId → stepId (or root) then existing seed                                                     |
| `AgentToolCallEvent` / `AgentToolResultEvent`         | Post-materialize tool I/O                                                     | Stay outcome-side for the agent loop; gate intent is separate and earlier                                  |
| `WorkflowStore` contract                              | No new method family                                                          | Resolve via events / projection only                                                                       |

---

## Numbered work (shipping order)

### 1. Event shape (core)

Add (or finalize) intent/outcome events on the workflow run stream:

```ts
// Preferred names — align with existing effect_* if we keep them
type EffectIntentEvent = WorkflowRunEventBase & {
  type: "effect_intent";
  intent: EffectIntent;
};

type EffectSettledEvent = WorkflowRunEventBase & {
  type: "effect_settled";
  intentId: string;
  decision: SettledEffectDecision; // allow | deny | rewrite (payload)
  // optional later: outcome result/error for irreversible replay
};
```

**Decision required in review:** keep `effect_suspended` / `effect_resumed` as aliases of park lifecycle, or fold park into `workflow_suspended` only and drop the unused `effect_*` pair. Today UI already understands both workflow*\* and effect*\*; pick one pause story and delete the other emitters.

Always emit `effect_intent` **before** `gate.handle`. Emit `effect_settled` after allow/deny/rewrite (and after suspend resolves, with the same decision). Suspended intents also still produce `workflow_suspended` so run status stays correct.

### 2. Shared emit helper (core)

One function used by context + (eventually) tools:

```ts
async function gateWithIntent(args: {
  recorder: RunRecorder; // or store + runSeq adopter
  intent: EffectIntent;
  gate: EffectGate;
}): Promise<SettledEffectDecision>;
```

- Records `effect_intent`
- Calls `gate.handle` (may park via `parkingEffectGate`)
- Records `effect_settled` with the non-suspend decision
- Throws on deny where call sites already throw

Bare gates that return `suspend` without parking still throw (existing fail-closed).

### 3. Wire call sites

1. `settleStepEnter` / step exit if gated
2. `requestApproval`
3. Tools `assertToolAllowed` — **needs a recorder or store+seq on `ToolEffectScope`**. Today tools only have `workflowRunId` / `stepId` / `agentCallId`. Extending scope with a required emit hook is part of this lane (fail closed: no silent skip of intent emission).

### 4. Cursor resolve

In `resolveCursorToStep` (or sibling):

1. If `effectId` set: find `effect_intent` event with `intent.id === effectId` on that `workflowRunId` (scan `listEvents` or projection).
2. Missing → throw.
3. Map to `fromStepId = intent.stepId` when present; if intent was at workflow root (`stepId` null), treat as “retry from run start” (define explicitly — likely refuse until we have a root cursor, or map to first step / seed whole run re-exec).
4. Then existing `seedRetryAttempt` path.

Inspector: optional effect-id picker later; step id remains default UI. No UI required for this lane to land.

### 5. Tests

- Contract / unit: intent + settled appear in `listEvents` with monotonic `runSeq`
- Suspend path: intent → workflow_suspended → resume → settled
- `seedRetryFromCursor({ effectId })` matches `stepId` seed for a step-enter intent
- Unknown / cross-run effectId throws
- Tools: assertToolAllowed emits when scope provides recorder (and throws if host omitted required emit capability — fail closed)

### 6. Docs / notes

- Update workflows guide Resumability: effectId addressable for step-boundary intents
- Mark execution-control Gaps row done for “effect intents not persisted”
- Leave finer-than-step replay and model-call intent emission as explicit deferrals

---

## Out of scope

- Cross-process continue of a parked `workflow.run` (already decided: abandon on restart)
- Env CoW / tools snapshot-restore
- DAP
- Agent episode `cacheable` / replay recorded model tokens mid-step
- `runSeq`-only cursors (may follow once intents exist)
- Growing `WorkflowStore` with `getEffect` / `listEffects` as required interface methods (projection table OK if private to sqlite impl and rebuildable; public resolve stays on events or a thin exported helper that takes `WorkflowStore`)

---

## Open decisions (locked 2026-10-05; shipped 2026-10-12)

1. **Event names:** `effect_intent` / `effect_settled`; park stays `workflow_suspended` / `workflow_resumed` only.
2. **Tools emit hook:** required `recordEffect` on `ToolEffectScope` — fail closed if missing.
3. **Root-level intents** (`stepId` null): refuse with a clear error in v1.
4. **Model-call intents:** still deferred (agent loop before `streamText`).

---

## Success criteria

1. After a run that hit the gate, `listEvents({ workflowRunId })` contains an `effect_intent` (final name TBD) for each gated call, and a settled event for each non-abandoned decision.
2. `seedRetryFromCursor({ cursor: { workflowRunId, effectId } })` for a step-enter intent produces the same attempt forest as the equivalent `stepId` cursor.
3. Unknown `effectId` throws; no silent fallback to step or “run from start.”
4. No new required `WorkflowStore` method family; custom in-memory store keeps working via `recordEvent` / `listEvents`.
5. Inspector Allow/Deny and L1 debugger still use `resolveSuspend` unchanged.
6. Notes (`execution-control-plan` Gaps, `near-term-roadmap`, `resumability`) updated and dated when the lane ships.

---

## Diff shape expectation (when implemented)

Likely: `observability/events.ts`, run-recorder observer allowlist, small `effect/record.ts` helper, `workflow/context.ts`, tools `ToolEffectScope` + `assertToolAllowed`, `retry-attempt.ts` resolve path, tests, docs. Delete dead `effect_suspended` emission paths or unused UI dual-handling if we consolidate — prefer net deletion of the unused pair over leaving both.
