# Execution control — Shepherd-shaped traces, debugger, approvals

**Status:** Design reviewed (2026-10-01). Decisions 1–6 locked. EffectGate types + compose land in `@agent-dev-lab/core`; tools wiring is Lane E; suspend persistence / cursor replay / debugger remain later.
**Parent for orch lanes:** this file. Briefs live under `notes/orch-briefs/`.
**Paper:** [Shepherd: Enabling Programmable Meta-Agents via Reversible Agentic Execution Traces](https://arxiv.org/abs/2605.10913) (Yu et al., arXiv:2605.10913).

Supersedes the deferred half of [`resumability.md`](./resumability.md) (crash/`checkpoint`/`cacheable`) as the **target shape**. Today's attempt lineage (`seedRetryAttempt`, path-stable skip, inspector Retry) stays shipped until a migration path is designed; do not silently rewrite it under another concern.

---

## Goal

Rework ADL's retry / pause / re-entry surface so an agentic run is a **first-class, inspectable, branchable execution object** — close enough to Shepherd's model that meta-agents (and humans) can observe, intercept before side effects materialize, fork/replay from a commit, and later drive a step debugger — without abandoning plain async workflows as the novelty layer ([`se-paper-framing.md`](./se-paper-framing.md)).

---

## Principles

1. **Commodity layer owns control of effects; novelty layer stays free.** Workflows remain typed async functions. The framework opinionates _boundaries_ (what is an effect, when it may materialize, how traces fork), not control-flow DSLs.
2. **Intent before outcome.** Anything that touches the world (tool call, model call, env mutation, approval wait) emits an **intent**; materialization is a separate step a handler can allow, deny, rewrite, or suspend on. Shepherd's intent/outcome split is the target; today's fire-and-forget tool `execute()` is not.
3. **One suspend primitive, many policies.** Human approval, debugger breakpoints, and meta-agent interception are **handlers** over the same gate — not three pause APIs.
4. **Trace is authoritative for re-entry; projections are derived.** Align with the existing event→projection rule. Retry-by-copying summaries is a v1 convenience; the long-term re-entry key is a **trace cursor** (commit / effect id), not only `fromStepId`.
5. **Reversibility is tiered.** Model calls are irreversible (audit + replay-from-record). Sandboxed FS/bash can be reversible when the executor supports CoW/fork. Compensable effects need explicit handlers. Do not pretend every effect is docker-revertible.
6. **Design for debugger and DAP now; ship debugger later.** API choices must not paint us into "retry only works at `ctx.step` and nowhere else."

---

## Reuse survey (lane A)

| Existing surface                                                                                                             | Role today                                                | Extend / adapt                                                         |
| ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------- |
| `packages/core` `Workflow` / `Agent` values                                                                                  | First-class tasks                                         | Keep; Shepherd Task maps here                                          |
| `RunEvent` + `runSeq` (`observability/events.ts`)                                                                            | Append-only after-the-fact log                            | Split tool/model into intent+outcome; keep `runSeq` as commit ordering |
| `WorkflowStore.seedRetryAttempt` / `retry-attempt.ts`                                                                        | New-attempt forest from `(fromWorkflowRunId, fromStepId)` | Compat wrapper → `TraceCursor`; do not mutate prior forests            |
| `WorkflowContext.step` / step records                                                                                        | UI-friendly boundaries + path-stable skip                 | L1 debugger + cursor alias when cursor is a step boundary              |
| `AgentToolCallEvent` / `AgentToolResultEvent`                                                                                | Closest today's intent/outcome pair (post-materialize)    | Pre-materialize gate sits _before_ call; result stays outcome          |
| `ApprovalDispatcher` sketch ([`future-extensions.md`](./future-extensions.md), [`tool-sandboxing.md`](./tool-sandboxing.md)) | Parallel pause idea                                       | Thin adapter over `EffectGate` for `kind: "tool"`                      |
| `@agent-dev-lab/tools` executors / sandbox roots                                                                             | Env isolation without CoW                                 | Later §4 hooks; gate lives in core, tools take required `EffectGate`   |
| Inspection UI Retry / waterfall                                                                                              | Human meta-agent ops                                      | Same cursor + suspend ops; DAP adapter is a second front               |

Not inventing a second pause API for Lane E.

---

## Shepherd → ADL mapping (target)

Shepherd elevates four primitives (paper §3): **Task**, **Effect**, **Scope**, **Trace**. ADL already has partial analogues; the gap is pre-materialize intercept and addressable re-entry.

| Shepherd                       | ADL today                                                                                                         | Target                                                                                       |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **Task** (typed fn value)      | `Agent` / `Workflow` values; nested `workflow.run()`                                                              | Keep; already first-class. No `@agent` docstring→prompt compiler.                            |
| **Effect** (intent + outcome)  | `RunEvent` after the fact (`agent_tool_call` / `agent_tool_result`, step start/finish, model text)                | Effect stream with **pre-materialize** intercept; intent id stable across allow/deny/suspend |
| **Scope** (fork/merge/discard) | Nested `workflowRunId` + `parentWorkflowRunId`/`parentStepId`; tools sandbox root                                 | Explicit run scope object; optional env CoW behind tools executors (not Docker-first)        |
| **Trace** (Git-like commits)   | Event log (`runSeq`) + attempt forests (`retriesFromRunId`, `replayOf*`)                                          | Addressable **trace cursor**; fork/replay from cursor; projections remain derived            |
| Meta-agent ops                 | Inspector Retry / observers / `WorkflowRunEventChannel`                                                           | Same ops for humans, UI, and programmatic meta-agents (subscribe + suspend + fork)           |
| Reversibility tiers            | Implicit (model irreversible; FS edits not reverted on skip — [`retry-side-effects.md`](./retry-side-effects.md)) | Explicit per-effect: irreversible / compensable / reversible-when-executor-supports          |

### What we deliberately will not clone

- Python `@agent` prompt-from-docstring / task synthesis as the primary authoring model.
- Lean mechanization of the effect calculus (paper contribution; not a product dependency).
- Docker CoW / `docker commit` as the default env fork (AGENTS.md: no Docker required for core; tools stay optional OS packages).
- Byte-identical agent+env checkout as a v1 promise — ADL tiers reversibility; FS revert waits on executor hooks (§4).
- Tree-GRPO / MetaHarness-class demos as shipping criteria for this lane.

---

## API sketch (types + call sites only)

Sketch only — no production code in this lane. Names are provisional; the shape is the contract Lane E must not contradict.

### Effect intent / outcome

```ts
type EffectKind = "tool" | "model" | "step" | "approval" | "custom";

type Reversibility = "irreversible" | "compensable" | "reversible";

interface EffectIntent {
  id: string; // stable; becomes TraceCursor.effectId when suspended/committed
  kind: EffectKind;
  reversibility: Reversibility;
  workflowRunId: string;
  stepId?: string | null;
  agentCallId?: string | null;
  /** Discriminated by kind: toolName+input, model descriptor, step path, … */
  payload: unknown;
}

interface EffectOutcome {
  intentId: string;
  status: "ok" | "denied" | "error" | "rewritten";
  result?: unknown;
  error?: { message: string; code?: string };
}
```

Today's `AgentToolCallEvent` ≈ outcome-side notification after execute. Target: emit intent → gate → (optional) execute → emit outcome. Model calls default `irreversible`; sandboxed FS/bash default `reversible` only when the executor advertises CoW (else `compensable` / treat as irreversible for discard).

### Handler chain + gate

```ts
type EffectDecision =
  | { action: "allow" }
  | { action: "deny"; reason: string }
  | { action: "rewrite"; payload: unknown }
  | { action: "suspend"; handle: SuspendHandle };

interface EffectHandler {
  /** Return undefined to defer to the next handler. */
  onIntent(intent: EffectIntent): Promise<EffectDecision | undefined>;
}

interface EffectGate {
  /** Required where materialization is possible — never optional with silent allow. */
  handle(intent: EffectIntent): Promise<EffectDecision>;
}

/** Compose: project policy → debugger → approval → execute (last). */
function composeEffectHandlers(handlers: EffectHandler[]): EffectGate;
```

**Call sites (conceptual):**

- Tools package: wrap `execute()` — `gate.handle({ kind: "tool", … })` before sandbox work.
- Agent loop: before provider tool dispatch / before non-cached model call.
- `ctx.step` enter/exit: `kind: "step"` for L1 breakpoints (cheap; may no-op when no debugger handler).
- `ctx.requestApproval`: `kind: "approval"` intent that always suspends until a human/policy handler resumes.

### Suspend handle

```ts
type SuspendReason = "approval" | "debugger" | "policy" | "meta_agent";

interface SuspendHandle {
  id: string;
  intentId: string;
  workflowRunId: string;
  reason: SuspendReason;
  /** Persisted run status while waiting (name TBD: waiting_approval | suspended). */
  createdAt: string;
}

interface SuspendStore {
  create(handle: SuspendHandle): Promise<void>;
  /** Resume with allow / deny / rewrite — same decision vocabulary as the gate. */
  resolve(
    handleId: string,
    decision: Exclude<EffectDecision, { action: "suspend" }>,
  ): Promise<void>;
}
```

One resume path for UI approval buttons, DAP `continue`/`step`, and meta-agent policy. Do **not** invent `workflow.resumeFromApproval` separate from `SuspendStore.resolve`.

### Trace cursor + retry compatibility

```ts
/** Address of a point in a prior attempt's effect stream. */
interface TraceCursor {
  workflowRunId: string;
  /** Prefer effect intent id. Step id is a UI alias when the cursor is a step boundary. */
  effectId?: string;
  stepId?: string;
  /** Optional: runSeq of the commit to replay through (inclusive). */
  runSeq?: number;
}

interface ForkFromCursorArgs {
  cursor: TraceCursor;
  /** Immutable prior forest — always seeds a new attempt (existing constraint). */
}

/** Target API. */
function seedRetryFromCursor(store: WorkflowStore, args: ForkFromCursorArgs): Promise<RetryAttempt>;

/** Compatibility — keeps today's inspector / tests working. */
function seedRetryAttempt(args: {
  fromWorkflowRunId: string;
  fromStepId: string;
}): Promise<RetryAttempt> {
  return seedRetryFromCursor(store, {
    cursor: { workflowRunId: args.fromWorkflowRunId, stepId: args.fromStepId },
  });
}
```

Replay policy: copy projections / recorded outcomes until the first intent that is non-replayable, rewritten, or past the cursor — same spirit as today's `reExecStepIds`, generalized past step boundaries.

---

## Numbered work (shipping order for the long lane)

### 1. Effect gate (shared substrate)

Land types + `composeEffectHandlers` in `packages/core`. Tools and agent dispatch take a **required** `EffectGate` (or a required factory from project config that throws if misconfigured — fail closed). See open decision §3.

### 2. Trace cursor + replay API (retry rework)

Implement `seedRetryFromCursor`; keep `seedRetryAttempt` as the thin wrapper above. Inspector Retry gains an optional effect-id picker later; step id remains the default UI address.

### 3. Step debugger (design now, implement later)

See **Debugger design** below. Implementation depends on §1 suspend.

### 4. Environment fork (later, tools-backed)

1. Gate + cursor without CoW (deny/suspend/replay recorded outcomes).
2. Sandbox CoW / snapshot hooks on `@agent-dev-lab/tools` executors where cheap.
3. Only then advertise "revert FS with discard."

### 5. Approval dispatcher (near-term lane E, constrained)

Ship tool-call gating **only** as an effect-gate adapter (or deprecated alias). Open questions in [`tool-sandboxing.md`](./tool-sandboxing.md) stay, but resume = `SuspendStore.resolve`, not a second protocol.

---

## Debugger design

### Granularity ladder (coarse → fine)

| Level             | Breaks on                              | Maps to              | Product default |
| ----------------- | -------------------------------------- | -------------------- | --------------- |
| L1 Workflow step  | `ctx.step` enter/exit                  | Waterfall row        | yes             |
| L2 Agent episode  | `agent.run` / turn boundary            | Episode inspector    | yes             |
| L3 Effect intent  | tool / model intent before materialize | Gate from §1         | yes             |
| L4 Host statement | JS breakpoints in workflow/tool code   | Node inspector / DAP | **no** (attach) |

**Default product debugger:** L1–L3 (agentic). L4 is "debug the TypeScript" — VS Code / Chrome DevTools against the host process. ADL does not own L4; document "Attach to Node" as complementary.

### DAP integration path (accept, do not reject)

Expose an **ADL Debug Adapter** (Debug Adapter Protocol) that speaks L1–L3:

| DAP concept         | ADL mapping                                                                 |
| ------------------- | --------------------------------------------------------------------------- |
| Thread              | `workflowRunId` (nested runs = child threads or frames)                     |
| Stack frame         | step path / episode / pending effect intent                                 |
| Breakpoint          | step path filter, episode boundary, or effect-kind filter                   |
| `stopped`           | suspend handle created (`reason: "debugger"`)                               |
| `continue` / `next` | `SuspendStore.resolve({ action: "allow" })` + optional one-shot L1/L3 break |
| Scopes/variables    | intent payload, step output projections, run summary                        |

**Frontends:** inspection UI first (native client over the same adapter protocol or direct `SuspendStore`); VS Code `DebuggerExtension` second via a small DAP server process that talks to the running ADL host (stdio or TCP). Same semantic model, two transports.

**Do not** require Node's inspector for L1–L3 — those pauses are cooperative at the effect gate. L4 remains optional attach.

**MVP DAP surface (decided):** map early onto standard `breakpoints` / `stopped` / `continue` / `next`; add custom ADL requests only where DAP has no analogue (e.g. `adl/forkFromCursor`). Avoid an ADL-only protocol that forces a second VS Code client later.

---

## Approval reuse (same gate)

```ts
/** Lane E public surface — adapter, not a parallel resume protocol. */
interface ApprovalDispatcher {
  request(req: ApprovalRequest): Promise<ApprovalDecision>;
}

// Adapter sketch:
async function approvalHandler(intent: EffectIntent): Promise<EffectDecision | undefined> {
  if (intent.kind !== "tool" && intent.kind !== "approval") return undefined;
  const decision = await dispatcher.request(toApprovalRequest(intent));
  if (decision === "allow") return { action: "allow" };
  if (decision === "deny") return { action: "deny", reason: "…" };
  // Interactive UI: return suspend; UI calls SuspendStore.resolve later.
  return { action: "suspend", handle: … };
}
```

- `ctx.requestApproval` → emit `kind: "approval"` intent → always suspend until resolve.
- Tool gating → `kind: "tool"` through the same handler chain.
- Debugger breakpoints → another handler that may suspend with `reason: "debugger"`.

Cross-links: [`future-extensions.md`](./future-extensions.md) § Human approval; [`tool-sandboxing.md`](./tool-sandboxing.md) § Approval / open questions (point here for substrate; keep tool-specific open questions there).

---

## Out of scope (this plan / wave)

- Full Shepherd meta-optimizer / Tree-GRPO demos.
- Mid-stream token resume (still non-goal).
- Message stores beyond appendable lists ([`retry-side-effects.md`](./retry-side-effects.md)).
- Replacing AI SDK `streamText` internals.
- Implementing the VS Code extension or DAP server in the first design pass (protocol sketch only).
- Env CoW implementation.

---

## Success criteria (design phase)

1. This note names the shared suspend/effect-gate substrate and how approval + debugger both sit on it. **Met.**
2. Granularity ladder L1–L4 is written with a default (L1–L3) and an explicit DAP direction. **Met.**
3. Retry rework has a migration story from `seedRetryAttempt` / `fromStepId` to trace cursors. **Met (design).**
4. Open decisions below are listed; design reviewed 2026-10-01. **Met.**
5. Orch lanes for independent P1/P2 work exist and point here where they touch pause/retry. **Met.**

---

## Decided (2026-10-01)

1. **Cursor identity:** primary key = **effect intent id**; `runSeq` is ordering; `stepId` is a UI alias when the cursor sits on a step-boundary intent. No synthetic commit-hash id space.
2. **Default when no handler registered:** **fail-closed** (deny). Hosts/tests that want permissive behavior pass an explicit `allowAllGate` (or equivalent accept-all handler). Never omit→warn-and-allow.
3. **Where the gate lives:** types + compose in **`packages/core`**; project config supplies the handler chain; **tools constructors require** an `EffectGate` — no optional default that silently allows.
4. **DAP MVP:** map standard DAP `breakpoints` / `stopped` / `continue` / `next` early; custom requests only for fork/cursor ops.
5. **Nested-run parent on live context:** **ship in lane B now** (does not conflict with the gate).
6. **Persisted run status while suspended:** general **`suspended`** (+ `suspendReason` / handle id on the run summary) when persistence lands. `waiting_approval` may remain a UI label when `reason === "approval"`. Not in the EffectGate types PR (no schema lock yet).

---

## Lane map (2026-10-01)

All A–J provisioned. Briefs under `notes/orch-briefs/`; parent plan is this file.

| Concern                                          | Brief                                    | Priority            | Task        | Notes                                                               |
| ------------------------------------------------ | ---------------------------------------- | ------------------- | ----------- | ------------------------------------------------------------------- |
| A Execution control (Shepherd + debugger design) | `orch-briefs/adl-execution-control.md`   | long / design-first | `t5d9a0e83` | Design reviewed; EffectGate types in core; further §§2–3 impl later |
| B Nested-run context + memory scope              | `orch-briefs/adl-nested-run-context.md`  | P1                  | `t8d512e60` | [`nested-run-followups.md`](./nested-run-followups.md)              |
| C Per-call model override                        | `orch-briefs/adl-model-override.md`      | P1                  | `t7cbbce46` | Roadmap §1                                                          |
| D MCP `ToolProvider`                             | `orch-briefs/adl-mcp-provider.md`        | P1                  | `t779666c3` | Roadmap §2                                                          |
| E Approval dispatcher                            | `orch-briefs/adl-approval-dispatcher.md` | P1                  | `t2d60c763` | Effect-gate adapter; tool surface only                              |
| F Nested conversation 404                        | `orch-briefs/adl-nested-conv-404.md`     | P2                  | `t788887a0` | Triage then fix                                                     |
| G Model catalog + picker                         | `orch-briefs/adl-model-catalog.md`       | P2                  | `tdd02dbd5` | After C                                                             |
| H Usage rollup + `$` estimates                   | `orch-briefs/adl-usage-rollup.md`        | P2                  | `tae696237` | Nested agent calls                                                  |
| I Inspector polish                               | `orch-briefs/adl-inspector-polish.md`    | P2                  | `ta7cd7c57` | Waterfall min width, preliminary tool UI, tool vs LLM time          |
| J Playwright gaps                                | `orch-briefs/adl-playwright-gaps.md`     | P2                  | `t9b778653` | Copied bars, nested expand, JSON editor depth                       |

**Not provisioned (open placement / lower urgency):** todo tool (core vs tools), datasets, structural cleanup, macOS bash, LSP, `writeFile` mkdir.

**Integrator WC:** tsk task `tde88a16b` (was Resumability) holds this plan until A takes over implementation.

---

## Gaps / not done

- Tools `execute()` wrap over `EffectGate` = Lane E.
- `SuspendStore` persistence and `suspended` run status (decision 6) — not started; no schema lock in the types PR.
- `seedRetryFromCursor` / inspector cursor picker — not started.
- Debugger UI / DAP server — not started.
- Env CoW research (§4) — not started.
