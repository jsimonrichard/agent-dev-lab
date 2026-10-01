## Goal

Give nested workflow invocations a live parent/root signal on `WorkflowContext`, and resolve whether `memoryScopeWithSuffix` should key the root of the invocation tree, the immediate run, or both via two helpers — closing the silent cross-phase conversation split after own-`workflowRunId` nesting.

## Principles

- Fail closed — no silent fallbacks
- Upstream before workaround
- Generalize; don't special-case
- One concern per change
- Plan first
- State what is not done

## Scope

1. Read and obey open decisions in [`notes/nested-run-followups.md`](../nested-run-followups.md).
2. Add a live context field (prefer `parentWorkflowRunId: string | null` over a lone `isRoot` boolean) populated for nested and root runs; `{ isolated: true }` stays parentless.
3. Decide and implement memory helpers: either root-scoped `memoryScopeWithSuffix` + `runLocalScope`, or document-and-keep immediate-run semantics with a new root helper — **one path**, delete the ambiguity in docs.
4. Tests for nesting + isolated + retry interaction with the chosen scope formula; update workflows guide nested-run / memory sections to match behavior.
5. Changeset for `@agent-dev-lab/core` (and docs package if needed).

## Out of scope

- Shepherd effect gate / debugger (Lane A).
- Nested conversation 404 triage (Lane F).
- Approval dispatcher (Lane E).
- Reworking `seedRetryAttempt` forests.

## Success criteria

1. A nested workflow body can tell it is nested without reading the store (`parentWorkflowRunId` or equivalent on `ctx`).
2. Cross-phase agents either share memory by default via an explicit root-scoped helper, or the docs + API make run-local the only meaning of `memoryScopeWithSuffix` with a named root alternative — no silent split.
3. Isolated helpers remain outside the parent chain.
4. `.claude/gate.sh full` green.

## Constraints

- Confirm `parentWorkflowRunId` vs `parentRunId` naming against existing store/event fields before exporting.
- Do not overload `stepId === null` to mean root.
- Coordinate with Lane A only if the field should live on a future Scope object — default is ship on `WorkflowContext` now.

## Handoff notes

Parent plan: `notes/execution-control-plan.md` (Lane B). Detail: `notes/nested-run-followups.md`.

Reuse: `WorkflowContext` / `workflow-impl.ts`, `memoryScopeWithSuffix`, workflows guide nested runs, store `parentWorkflowRunId` projections.
