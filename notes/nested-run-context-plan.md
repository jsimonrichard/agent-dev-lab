# Nested-run context + memory scope (Lane B)

**Status:** Done — `.claude/gate.sh full` green. Parent orch brief: `notes/orch-briefs/adl-nested-run-context.md`. Detail: `notes/nested-run-followups.md`.

## Goal

Close the two open nested-run gaps after own-`workflowRunId` nesting: a live root/parent signal authors can use without reading the store, and an unambiguous memory-scope API so cross-phase agents do not silently split conversations.

## Principles

- Fail closed; no silent fallbacks.
- One path — delete the helper ambiguity in docs and API.
- Prefer existing store field names (`parentWorkflowRunId`).
- Ship on `WorkflowContext` now (Lane A open decision #5); do not wait for Scope objects.
- Isolated runs stay outside the parent/root chain.
- Do not overload `stepId === null` to mean root.

## Locked decisions

1. **Parent signal:** keep `parentWorkflowRunId: string | null` on `WorkflowContext` (already populated). Do **not** add a lone `isRoot` boolean; `parentWorkflowRunId === null` is the root/isolated predicate.
2. **Root id for memory:** add `rootWorkflowRunId: string` on `WorkflowContext`, always set. Equals `workflowRunId` when `parentWorkflowRunId === null` (top-level and `{ isolated: true }`). Nested contexts inherit the parent's `rootWorkflowRunId` (precomputed; no store walk).
3. **Memory helpers (Option A):**
   - `memoryScopeWithSuffix(suffix)` → `` `${rootWorkflowRunId}:${suffix}` `` (cross-phase default; restores the usually-intended span).
   - `runLocalScope(suffix)` → `` `${workflowRunId}:${suffix}` `` (immediate run only).
4. **Attempt-forest root for memory** is the same as invocation-tree root: `rootWorkflowRunId`. Isolated helpers are their own root (`parentWorkflowRunId === null` and `rootWorkflowRunId === workflowRunId`).

## Reuse survey

| Existing                                                                         | Role                                                                                |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `WorkflowContext` / `WorkflowContextImpl` (`types.ts`, `context.ts`)             | Extend with `rootWorkflowRunId` + `runLocalScope`; retarget `memoryScopeWithSuffix` |
| `workflow-impl.ts` `createWorkflowContext` options                               | Populate `rootWorkflowRunId` from parent or self                                    |
| `createChildWorkflowContext` / `refreshWorkflowContext`                          | Pass `rootWorkflowRunId` through                                                    |
| Store/events `parentWorkflowRunId`                                               | Naming authority; live field already mirrors it                                     |
| `retargetMemoryScope` + `memory-scope-access.test.ts`                            | Retry still maps `${runId}:…` prefixes; root id is in `runIdMap`                    |
| `execute.test.ts` nesting / isolated cases                                       | Extend for root id + scopes                                                         |
| `apps/docs/.../workflows.md` nested + memory sections                            | Rewrite to match helpers                                                            |
| `notes/nested-run-followups.md`, `near-term-roadmap.md`, `retry-side-effects.md` | Status / formula updates                                                            |

## Work sections

1. Add `rootWorkflowRunId` + `runLocalScope`; change `memoryScopeWithSuffix` to root-scoped; wire create/child/refresh.
2. Tests: nest tree shares root scope; isolated is its own root; retry skip-copy still retargets root-scoped transcripts; nested `runLocalScope` differs per phase.
3. Docs: workflows guide nested/memory/API surface; fix stale “live field not shipped” claims.
4. Notes: mark follow-ups resolved; roadmap row; retry-side-effects formula.
5. Changeset for `@agent-dev-lab/core` (minor: behavior change of helper + new fields/methods).

## Out of scope

- Shepherd / Scope object redesign (Lane A).
- Nested conversation 404 (Lane F).
- Approval dispatcher (Lane E).
- Reworking `seedRetryAttempt` forests.

## Success criteria

1. Nested body can use `ctx.parentWorkflowRunId` / `ctx.rootWorkflowRunId` without the store.
2. Same `memoryScopeWithSuffix("x")` across nest phases shares one transcript; `runLocalScope` does not; docs name both.
3. `{ isolated: true }` has `parentWorkflowRunId === null` and its own `rootWorkflowRunId`.
4. `.claude/gate.sh full` green.
