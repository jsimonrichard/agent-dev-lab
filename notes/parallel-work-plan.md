# Parallel work plan (post-0.1.0)

**Status:** Draft, for scheduling. Companion to [`near-term-roadmap.md`](./near-term-roadmap.md), which decides _what_ and _in what priority_; this file decides _what can run at the same time_ and _what must not_.

**Method:** concurrency here is bounded by two things, neither of which is priority:

1. **File contention** — two lanes editing the same file serialize whether you plan for it or not.
2. **Decision gates** — open questions in the roadmap that change where code lives. Starting a lane before its gate is answered risks throwing the work away.

Everything below is derived from the roadmap's remaining (🔲/🚧) items plus gaps found while fixing CI on 2026-09-07.

Last written: **2026-09-07**.

---

## 1. Contention map

The hotspots that actually constrain the schedule. Lanes are built around these, not around roadmap section numbers.

| Hotspot                                                                                | Claimants                                                                                                                  | Verdict                                                                                                                                 |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **`packages/core/src/agent/agent-impl.ts`** (493 lines; `executeTurn` spans 142–441)   | Per-call model override (§1), usage/cost tracking (§7), `executeTurn` refactor (§7)                                        | **Hard serial.** All three rewrite the same ~300-line function. One lane, three ordered steps. See §4.                                  |
| **`packages/core/src/db/schema.ts`** + `ensure-schema.ts` + `sqlite-workflow-store.ts` | Git-hash tagging (§5), `adl_agent_episodes` (D1b), `adl_conversation_metadata` (D5), datasets (§5), SQLite `EventLog` (§6) | **Consolidated, not serialized.** The first three are one lane (S) doing a single migration pass; later arrivals rebase after it lands. |
| **`packages/tools/src/index.ts`** (barrel)                                             | grep/glob, `fetchUrl`, todo tool, approval gate                                                                            | **Soft.** Append-only export blocks — conflicts are mechanical. Convention in §6 keeps them trivial.                                    |
| **`apps/web` components**                                                              | Model picker UI (§1), usage/cost UI (§7), datasets UI (§5), catalog grouping (§6)                                          | **Mostly soft.** Different components, except `agent-settings-panel.tsx` (picker + usage) and routing (grouping).                       |
| **`notes/near-term-roadmap.md`**                                                       | Every lane wants to flip its own status emoji                                                                              | **Guaranteed conflict.** Lanes must not edit it; see §6.                                                                                |
| **`.github/workflows/ci.yml`**                                                         | Playwright-in-CI (§6), plus the open PR #32                                                                                | **Soft**, but land PR #32 first so lanes branch from a settled workflow.                                                                |

---

## 2. Decision gates

Judgment calls, not research. Each is cheap to answer and expensive to guess wrong.

### Open

| Gate   | Question                                                                                                                                                                                                     | Blocks |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| **D2** | Todo tool placement (§2): `packages/core` or `packages/tools`? It's inert per-run state, so it does **not** share the sandboxed package's rationale.                                                         | Lane F |
| **D3** | Datasets scope (§5): organizational only (run N inputs, tag the batch, compare side by side), or does this reopen `future-extensions.md`'s "no built-in evals" non-goal? The roadmap reads it as the former. | Lane H |
| **D4** | Approval gate (§2/§6): confirm pulling `future-extensions.md`'s approval dispatcher forward as a co-requisite of the sandboxed tools, rather than leaving it deferred.                                       | Lane G |

### D1 — Model swap semantics: **resolved 2026-09-07**

Model resolution becomes a three-level precedence chain, replacing the two-level
`this.definition.model ?? this.services.defaults.model` at `agent-impl.ts:234`:

```ts
const model = input.model ?? this.definition.model ?? this.services.defaults.model;
```

Every level is a live `LanguageModel`, and **no model is persisted for later reconstruction** —
that is the property that keeps the change small. A read-only descriptor of the model actually
used _is_ recorded; see D1b, and note the distinction there, because conflating the two
reintroduces a catalog dependency in core that this decision exists to avoid.

**Decided against — `agent.setModel()` / mutable per-instance model.** Two reasons from the code,
not from taste:

- `load-config.ts:38-41` deliberately drops the jiti cache so hot reload re-evaluates the
  registry source, which **reconstructs agents**. An in-memory mutation is silently wiped on
  every `adl.config.ts` save during `dev` — fatal for something meant to persist across turns.
- `Agent` instances are constructed once and shared process-wide across concurrent
  conversations. Mutating one is a cross-conversation side effect: switching the model in one
  open chat would silently change every other chat using that agent.

**Deferred — conversation-pinned model (per `memoryScope`).** Considered and explicitly put off,
not merely unbuilt. Worth recording why it is _not_ simply "follow the system-prompt pattern":
the system prompt auto-pins to a scope for **transcript coherence** (a stored episode only makes
sense under the prompt that produced it), resolved via `systemPromptConflict: "keep-pinned"` plus
a warning. A model has no such requirement — switching mid-conversation is the entire point of
the feature. So if pinning is ever revived it must be **explicit-pin-only**, never auto-pin, or
conversations will silently freeze onto whatever model they first ran with.

Reviving it also reintroduces serialization: `LanguageModel` is the AI SDK's
`string | LanguageModelV2`, and this repo uses `openai(modelId)` — a live object with methods.
`inspectLanguageModel` extracts `{ modelId, provider }` for display, but there is no path back
from those strings to a working model without a factory. **A persisted pin therefore requires a
catalog to resolve id → factory.** That dependency is why pinning was deferred rather than
scoped down.

### D1a — Model catalog scope: **resolved 2026-09-07**

The catalog is a **UI-impacting setting only**. It populates the picker and maps a selected id to
a live model inside `apps/web`'s server functions; the browser cannot send a `LanguageModel` over
the wire, so that mapping has to exist somewhere, and this is it. **`packages/core`'s resolution
chain never consults it.**

Consequence: the catalog stops being a prerequisite for the core override, and the two split
across the package boundary — Lane E is core-only, Lane J owns the catalog end to end.

### D1b — Record the model actually used: **resolved 2026-09-07**

Ships **with** the per-call override in Lane E, not after it. Today the model is a constant per
agent, so it can be read off the definition; a per-call override breaks that assumption, and
once turns can vary, nothing in the system records what produced what. Verified: `model` appears
nowhere in `observability/events.ts` or `db/schema.ts`. Shipping the override without this gives
a switch whose effects are unobservable — which defeats §1/§7's stated purpose of comparing
cost and quality across models rather than guessing.

**Two different things, only one of which is needed:**

|                                        | Purpose                                     | Shape                                                                                | Needs a factory/catalog?           |
| -------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------- |
| **Descriptor** (what this is)          | Record what ran, for display and comparison | `{ modelId, provider }` strings, exactly what `inspectLanguageModel` already returns | **No** — write-only, never rebuilt |
| **Round-trip** (deferred with pinning) | Rebuild a working model from storage        | id → factory → `LanguageModel`                                                       | **Yes**                            |

**Where it goes: a new `adl_agent_episodes` table, plus the `agent_started` event payload.**

The descriptor is carried on the `agent_started` event (an optional field on an existing event
type — deliberately milder than a new event type, since `apps/web`'s exhaustive `RunEvent`
switches key on `type` and keep compiling; this is the ripple that got `ctx.setTags` deferred,
and why this stays cheap where that did not). It then lands in a real table.

**Why a table rather than leaving events as the queryable record** — see D5; the short version is
that `materializeEvent` already projects `workflow_started` into `adl_workflow_runs`, so
workflow runs have an entity table and agent episodes do not. That asymmetry is the anomaly.

Episode granularity is correct today, since one `run()` call resolves one model. It stops being
correct if §1's `prepareStep` per-step model switching is ever added; revisit then.

**Relationship to messages** — worth stating because it is easy to assume otherwise: messages are
**not rows**. `adl_messages` is `INSERT OR REPLACE` of an entire transcript as one JSON blob
keyed by `memoryScope`. So the shape is _many episodes → one memoryScope → one messages row_, and
**a message cannot be joined to the episode that produced it**. Per-message model attribution
would mean annotating inside the blob via `providerOptions.adl` (the pattern the system-prompt
pin already uses) — fine for rendering a per-bubble label, useless for analysis. The episode row
is the real record; message annotation is optional and only if the UI wants per-bubble labels.

### D1c — Picker default: **resolved 2026-09-07**

The picker defaults to the model recorded on the conversation's **most recent episode** (D1b),
read from `adl_agent_episodes`. This is what makes the absent pin acceptable: continuity across
reloads comes from reading back provenance rather than from storing a preference, so the
descriptor does double duty and no round-trip serialization is reintroduced.

Two consequences to handle rather than discover:

- **The recorded model may not be in the catalog** — an agent's `definition.model` need not appear
  in `models: [...]`. The picker must surface it as a current-but-unlisted value, not silently
  snap to a catalog entry (no silent fallbacks).
- **A conversation with no episodes yet** has nothing to read back, so the default falls to the
  agent's own `modelInfo`.

### D5 — Entity tables vs. the event log: **resolved 2026-09-07**

**Principle: events stay the single append-only source of truth; entity tables are projections
off them, rebuildable by replay.** This is not a new pattern — `materializeEvent`
(`sqlite-workflow-store.ts:84`) already does exactly this, appending every event to
`adl_workflow_events` and then projecting `workflow_started` into `adl_workflow_runs`. The name
of the function is the design.

So the log does not become "the source of truth for too many things"; it stays the one source of
truth, with cheap read models on top of it. Two tables get added as projections:

**`adl_agent_episodes`** — one row per `agent.run()`, projected from `agent_started`, carrying
`model_id` / `model_provider` (D1b). Replaces deriving episodes by scan. Today
`listAgentEpisodes` runs `SELECT payload_json … WHERE type='agent_started' ORDER BY at DESC`,
then `JSON.parse`s **every** row and applies `agentId`/`limit` in JavaScript afterward — an
index on `(type)` exists so the lookup is fine, but there is no `LIMIT` pushdown and `ORDER BY at`
is uncovered, so cost grows with total episodes ever recorded on every call. A table also gives
the episode a single row for its mutable lifecycle (status, `finishedAt`) instead of splitting
start and terminal state across two event rows.

**`adl_conversation_metadata`** — replaces `adl_inspector_sessions`, **moved into core**. Named
for what it is: metadata _about_ a conversation, explicitly **not** the source of truth for
message content (that is `adl_messages`). Keyed by `memory_scope`, carrying the existing
`agent_id`, `title`, `created_at`/`updated_at`, `fork_json` (lineage: forked out of an agent call
inside a workflow run) and `deleted_at`.

Three concrete problems this fixes:

- **Core generates a title it cannot store.** `maybeSetConversationTitle` runs the agent's
  `titleWorkflow` and emits `agent_title_set`, then stops. The only durable home is the UI-owned
  table, written solely by `apps/web`'s `persistInspectorSession`. A headless `adl run` generates
  a title and drops it.
- **`agentId`-per-scope is stored twice** — once here, once in the pinned system message's
  `providerOptions.adl.agentId` (what `readStoredAgentId` reads). Two sources of truth.
- **The old name described the writer, not the entity.** Core's vocabulary is "conversation"
  throughout (`conversation-title.ts`, `ConversationTitleInput`, "names the conversation after the
  first successful episode").

**Coverage widens:** a row must exist for **every conversation that sets a title**, not only
those created through the UI. Today rows appear only for `apps/web` `AgentSession`s. Projecting
`agent_title_set` in core covers headless runs too.

Open sub-question, worth deciding rather than defaulting: `materializeEvent` lives in the
_workflow_ store, so having it write a conversations table couples two stores. It may belong in
the message store, or in a small shared projection layer.

---

## 3. Wave 1 — start these in parallel today

Gates D1/D1a/D1b/D5 are resolved (§2). The only shared file is the soft tools barrel (A/B).

| Lane                                           | Scope                                                                                                                                                                                                                                                 | Owns                                                                         |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **A — Grep/glob search tools** (P1, §2)        | `grep({pattern, path, glob?})` / `glob({pattern})` over `rg`. **Blocked on a `runArgv` addition to `BashExecutor`** — see §8. Roadmap calls this the highest-value/lowest-effort item of the batch; `ripgrep` is already a hard dependency.           | new `packages/tools/src/search/`, plus `packages/tools/src/bash/executor.ts` |
| **B — `fetchUrl` tool** (P1, §2)               | Fetch one URL, reduce to readable text/markdown. SSRF guard against redirects into private IP ranges; fetched content always treated as untrusted text.                                                                                               | new `packages/tools/src/web/`                                                |
| **S — Schema & persistence** (P1, §5 + D1b/D5) | One migration pass covering all three schema changes: `adl_agent_episodes`, `adl_conversation_metadata` (renaming `adl_inspector_sessions` and relocating it into core), and git-hash/version tagging on runs. **Holds the schema lock exclusively.** | `db/schema.ts`, `ensure-schema.ts`, `sqlite-workflow-store.ts`, `stores/`    |
| **D — Repo hygiene & CI**                      | The four items from the 2026-09-07 CI work; see §5.                                                                                                                                                                                                   | `AGENTS.md`, `packages/core/src/project/watch.e2e.test.ts`, `.github/`       |
| **E — Per-call model override** (P1, §1)       | `model?` on `AgentRunInput`, threaded through the single resolution point at `agent-impl.ts:234`, plus the `{ modelId, provider }` descriptor on the `agent_started` event. **Core only — no catalog** (D1a). Step 1 of the serial core chain.        | `agent-impl.ts`, `observability/events.ts`                                   |

**Why S is one lane and not three.** Git-hash tagging, the episodes table, and the conversation
metadata rename all migrate `db/schema.ts`. Under §6's schema-lock rule they would serialize into
a queue of three lanes each writing a migration against a moving target. Consolidating removes
the contention instead of scheduling around it, and one migration pass is less total work than
three sequenced ones.

**Why E starts now rather than after the refactor:** it is P1 and the refactor is P2, and the
override is a targeted change at one resolution point. Landing it first means the refactor
(Lane I) absorbs it once, instead of the override rebasing onto a rewritten function.

**The E ↔ S contract.** E adds `model?` to the `agent_started` event; S persists it into
`adl_agent_episodes`. Different files, so they can run concurrently provided the field shape is
agreed up front — otherwise land E first and let S project an already-stable event.

## 4. The serial chain — `agent-impl.ts`

Three roadmap items rewrite the same function. Running them concurrently guarantees rework, so they are one lane in a fixed order:

```
E. Per-call model override (P1, §1)     ← Wave 1, gated on D1
      ↓
I. executeTurn refactor (P2, §7)        ← split into named steps; pure, no behavior change
      ↓
K. Usage/cost tracking (P2, §7)         ← lands into the already-split structure
```

Doing K before I means writing token accounting into the ~300-line closure and then immediately moving it. Doing I before E delays a P1 behind a P2. The roadmap also notes the refactor should re-examine the remaining AI SDK boundary casts (`StreamTextResult`/`AsyncIterable` erasure, `TOutput` around `outputSchema.parse`) — a structural split may remove the need for some rather than re-justifying them in place.

---

## 5. Lane D detail — findings from the 2026-09-07 CI work

Grouped as one lane because each is small and they share no files with the feature lanes.

| Item                             | Detail                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`AGENTS.md:45` is stale**      | Says CI "runs lint and format checks". CI also runs typecheck, test, build, and (via PR #32) `test:node`. Understated before that PR and still is.                                                                                                                                                                                                   |
| **`watch.e2e.test.ts` is flaky** | "GET /api/project picks up an atomic edit" (line 232) timed out at 29s on the PR #31 merge commit and passed on a re-run of that identical commit. The failure showed `generation: 0` — the watcher never observed the edit at all, so this is file-watch reliability on CI, not a too-short poll. Will keep reddening `main` intermittently.        |
| **Bun `node:test` cascade**      | An async throw in a `node:test`-style file under `bun test` corrupts the root context and takes an unrelated file's whole suite down with it ([oven-sh/bun#5090](https://github.com/oven-sh/bun/issues/5090)). It is **loud** (Bun counts the errored file as a failure and exits non-zero), so no guard is needed — but nothing was filed upstream. |
| **PR #32 branch naming**         | The two follow-up commits sit on `ci-install-sandbox-deps`, reusing already-merged PR #31's branch name. Contents correct; history reads oddly. Cosmetic.                                                                                                                                                                                            |

---

## 6. Conventions that keep lanes from colliding

- **No lane edits `near-term-roadmap.md`.** Status updates funnel through one integrator at merge time, or each lane touches only its own row. Otherwise every lane conflicts on the same table.
- **Barrel exports:** add one contiguous `export {…} / export type {…}` block per feature module, ordered by module name, matching the existing shape of `packages/tools/src/index.ts`. Keeps conflicts to whitespace.
- **Schema lock:** only one lane holds `db/schema.ts` at a time (Wave 1: Lane S, which consolidates every currently-known migration). Others rebase after it lands rather than writing a parallel migration.
- **Gate before push:** `.claude/gate.sh full` — format:check, lint, typecheck, test, `test:node`, build.
- **One concern per change**, per `AGENTS.md`'s house rules; a lane may produce several commits.

---

## 7. Wave 2 and Wave 3

**Wave 2** (unblocked once Wave 1 lands):

| Lane                                            | Depends on                                                                                                                                                                                                                                                                                                                                |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **F — Todo/plan-tracking tool** (P2, §2)        | D2                                                                                                                                                                                                                                                                                                                                        |
| **G — Approval/permission gate** (§2, 🚧)       | D4; best after A/B so it gates every tool uniformly                                                                                                                                                                                                                                                                                       |
| **H — Datasets / batch run + compare** (P2, §5) | D3, and Lane S's migration landed                                                                                                                                                                                                                                                                                                         |
| **I — `executeTurn` refactor** (P2, §7)         | Lane E                                                                                                                                                                                                                                                                                                                                    |
| **J — Model catalog + picker UI** (P2, §1)      | Lanes E + S. Owns the catalog end to end (D1a): `models: [...]` config, the picker, id → live-model mapping in `apps/web` server functions, and §1's provider-key validation. **The picker defaults to the model recorded on the conversation's most recent episode** (D1b), which is what gives continuity across reloads without a pin. |

**Wave 3:**

- **K — Usage/cost tracking** (P2, §7) — after Lane I.
- **L — `createNativeBashExecutor` macOS backend** (P3, §2) — hardware-gated, not schedule-gated; can run anytime someone has a Mac.
- **M — P3 backlog** — memory pipeline, checkpoints/resumability, workflow catalog grouping, template playground, `@agent-dev-lab/hooks`, token-debug pane, stress-test example, Playwright-in-CI.

**Small independent fillers** (no gate, no contention — good for spare capacity):

- `ctx.setTags` sugar — the deliberate fast-follow deferred when run tagging shipped, to avoid rippling into every exhaustive `RunEvent` switch in `apps/web`.
- `createFileTools` parent-directory auto-creation — known gap called out in §2 of the roadmap.
- Roadmap line-reference fix: §6 cites `runtime.md:99` for the SQLite `EventLog` claim; it is actually **line 76**.

---

## 8. Findings that change a roadmap item as written

### Grep/glob: which layer actually enforces the path boundary

The roadmap describes grep/glob as jailed "the same way `createFileTools` is" and running "through
the same sandboxed `BashExecutor`". Checked directly, and **neither bounds reads to a root today**:

- **`createFileJail` is a check-then-use path validator, not a boundary.** Its own doc comment says
  so: "not a kernel-enforced boundary", with a known TOCTOU window, scoped to a threat model where
  "the _model_ is the adversary, via tool-call arguments". It validates a path handed to it and has
  no visibility into what a subprocess does afterward.
- **The executors bound writes, not reads.** `createNativeBashExecutor` does `--ro-bind / /` — the
  entire host filesystem is readable inside the sandbox. `allowWrite` is an allow-list, but
  `denyRead` is a **deny**-list, and ASRT is the same shape (`denyRead` sits "on top of whatever
  ASRT denies by default").

`rg` is a recursive reader, so for a grep tool the thing actually keeping results inside the root is
**the argv that gets constructed** — not a sandbox boundary. That is worth stating in the tool's own
docs rather than implying kernel enforcement, consistent with how `createFileJail` documents itself.

**Blocking prerequisite: `BashExecutor` has no argv-level entry point.** `run` takes a command
_string_, and both executors execute it via `/bin/bash -c <string>`. Building an `rg` invocation
therefore means quoting a model-supplied regex into shell syntax — an injection surface
(`` ` ``, `$()`, `;`). `runArgvIntoChannel` already takes argv and is used internally by both
executors, but is neither on the `BashExecutor` interface nor exported from the barrel. Lane A
should add `runArgv` to the interface first so the pattern is never shell-parsed; the plumbing
exists, so this is an interface addition rather than new machinery.

### SQLite `EventLog`: the doc is correct, not buggy

§6 lists a "**Docs bug:** `runtime.md:99` says a SQLite `EventLog` is not implemented yet" and asks
for a check. Checked: `packages/core/src/observability/` exports `inMemoryEventLog` and
`sqliteWorkflowStore`, but there is no `sqliteEventLog` — the process-wide event log is in-memory
only, exactly as documented.

So this is not a docs fix. It is either a real feature ("build a SQLite-backed `EventLog`") or an
accepted gap, and it needs that decision before it can be scheduled — it would rebase onto Lane S's
migration. Only the stale line number (99 → 76) is a docs fix.

---

## 9. Out of scope for this plan

- Re-prioritizing the roadmap. P1/P2/P3 are taken as given; this file only schedules them.
- Reopening the "no built-in evals / scorers" non-goal — unless D3 explicitly decides to.
- Publishing `@agent-dev-lab/tools` (still `private: true`, changeset-ignored).
- Anything in `v1-scope.md` already marked ⏸ deferred, except where §7's Wave 3 names it.

## 10. Success criteria

- Every active lane has a set of owned files disjoint from every other active lane, or an explicitly named serialization point (§1, §4).
- No lane starts before its gate in §2 is answered.
- Each lane lands green through `.claude/gate.sh full`.
- `near-term-roadmap.md` status changes come from one integrator, not from each lane.
