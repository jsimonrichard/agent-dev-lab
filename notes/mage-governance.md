# MAGE-style governance for ADL (review capacity)

**Status:** Done — wave 0 (2026-10-02). Inventory + cheap alignments landed in `adl-review-governance` (`t7e08c6c7`); spine forks inherit obligations below.
**Source:** James C. Davis et al., [Model-Based Agentic Engineering](https://davisjam.github.io/model-based-agentic-software-engineering/) ([arXiv:2608.25174](https://arxiv.org/abs/2608.25174)). Not Ben Davis.

ADL already has pieces of a governed environment (`gate.sh`, house rules, store contracts, EffectGate types). Review is still the bottleneck because too many properties are reconstructed from code on every agent PR. This note is **governance conversion**: turn recurring human review into models + checks agents inherit.

Provisioning: **`tsk task fork` + `HANDOFF.md`**, not orch lanes.

---

## Goal

Reduce human reconstruction-per-PR by (1) naming the few models that answer recurring review questions, (2) wiring settled obligations to validators/gates where cheap, (3) leaving uncertain product judgment open for humans.

---

## Principles

- **Smallest useful model** — only representations that answer a repeated question and can drift-check.
- **Alignment over prose** — a rule without a constraint/validator/gate is still guidance (house rules stay; encode the ones that keep biting).
- **Commodity layer only** — model effects, ownership, attempt forests; do **not** model free-form workflow `run()` bodies as graphs.
- **Convert, don’t archive** — when Bugbot or review finds the same class of bug twice, add a check or update this inventory; don’t only paste the finding into chat.
- One concern per `tsk task fork`.

---

## Models worth having (ADL)

| Model                        | Question                                   | Today                                                                | Next alignment                                                              |
| ---------------------------- | ------------------------------------------ | -------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| **Effect / behavioral**      | What may touch the world before it runs?   | Types + compose in core; tools require `EffectGate` (Lane E)         | UI Allow/Deny + SuspendStore (spine); keep contract tests                   |
| **Ownership / layer**        | May this package import that one?          | ESLint `no-restricted-imports` on core/tools (wave 0)                | Optional dep-cruiser later if needed                                        |
| **Provenance / forests**     | Is retry a new attempt or in-place mutate? | `seedRetryAttempt`, immutable forests, store contracts               | Keep; add guards if agents start rewriting prior forests                    |
| **Decision / policy**        | Fail-closed vs allow?                      | Locked in [`execution-control-plan.md`](./execution-control-plan.md) | Tools README + constructors require explicit `allowAllGate` — no omit→allow |
| **Session / scope identity** | Which run owns a root-scoped memoryScope?  | First-writer-wins `workflowRunId` attach (wave 0)                    | Done for Bugbot overwrite; watch new session paths                          |
| **Measurement**              | Regressions?                               | `gate.sh`, Playwright, timing, usage rollup                          | Extend when a class of flake becomes recurring (e.g. e2e port)              |

**Explicitly not now:** full formal specs of the runtime, RAG-everything, graph DSL of workflows.

---

## Wave 0 — beforehand (`adl-review-governance`)

**Shipped (2026-10-02)** in task `t7e08c6c7`. Inventory + encode; no EffectGate rewrite.

Landed:

1. Review-question inventory (table below).
2. Cheap alignments: package-layer ESLint smoke; tools README quick start requires `effectGate`; session/`workflowRunId` first-writer-wins (Bugbot).
3. Changeset-presence CI **deferred** (see inventory #5).
4. [`near-term-roadmap.md`](./near-term-roadmap.md) + this file updated for gated vs human-only.
5. Later HANDOFFs cite [`mage-governance.md`](./mage-governance.md) obligations.

**Success:** a maintainer can skim an agent PR for _product_ judgment; effect/layer/provenance questions are either green in CI or listed as known open.

### Review question → check → gap (wave 0 inventory)

| #   | Review question                                                              | Existing check                                                                                 | Gap / disposition                                                                                                                                         |
| --- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | May a tool materialize a side effect without an `EffectGate`?                | Lane E: providers require `effectGate`; `assertToolAllowed` before execute                     | **Gated** (types + tools tests). Residual: UI Allow/Deny + SuspendStore (spine forks).                                                                    |
| 2   | Does omitting a gate silently allow?                                         | `execution-control-plan.md` decision; constructors require the arg                             | **Gated** in tools. README quick start shows `allowAllGate` explicitly (wave 0).                                                                          |
| 3   | May `packages/core` import `web` / `cli` / `tools`?                          | ESLint `no-restricted-imports` on core (+ tools ↛ web/cli)                                     | **Gated** (wave 0).                                                                                                                                       |
| 4   | Shared root `memoryScope`: which `workflowRunId` owns the inspector session? | First-writer-wins attach in `registerAgentSessionFromEpisode` / `FromEvent` + regression tests | **Gated** (wave 0).                                                                                                                                       |
| 5   | Public package change without a Changeset?                                   | Release workflow + human review; many pending `.changeset/*.md`                                | **Deferred:** naive “any package diff needs a new changeset file” is noisy on stacked unpublished changesets; needs a dedicated design. Still human-only. |
| 6   | Is retry a new attempt forest or in-place mutate of a prior run?             | `seedRetryAttempt`, store contracts, immutable forests                                         | **Gated** by existing contracts; keep watching for rewrite regressions.                                                                                   |
| 7   | Do user-reachable run failures show in the inspection UI (not only console)? | House rule 1 + UI paths for start-run / reload errors                                          | **Human-only** for new surfaces; e2e covers some paths. No new automated check in wave 0.                                                                 |

Lane E already landed required gates in tools — “document fail-closed if E not merged” was N/A; wave 0 tightened the tools README quick start instead.

---

## Later waves (after current A–J land + wave 0)

See [`execution-control-plan.md`](./execution-control-plan.md) § Next forks. Spine: effect-gate-at-tools → retry-from-cursor → suspend persistence → debugger L1. Parallel: MCP/catalog/`$`/todo when free.

---

## Out of scope

- Replacing house rules or `gate.sh` wholesale with a MAGE skill pack.
- Automating product design review.
- Formal verification of agent prompts.

---

## References

- Davis et al., MAGE site + book: https://davisjam.github.io/model-based-agentic-software-engineering/
- Paper: https://arxiv.org/abs/2608.25174
- ADL execution spine: [`execution-control-plan.md`](./execution-control-plan.md)
