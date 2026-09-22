# Resumability (deferred)

Attempt lineage is **shipped**: new-attempt seed (`seedRetryAttempt`), path-stable step skip, `StepOptions.pure`, nested forests (`parentWorkflowRunId` / `parentStepId`), and inspection-UI Retry. User-facing contract lives in the [workflows guide — Resumability](../apps/docs/src/content/docs/core/workflows.md#resumability). Do not restate that API here.

Last reconciled: **2026-09-22**.

---

## Still open

| Item                                  | Notes                                                                                                                                          |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Crash mid-closure / `ctx.checkpoint`  | Re-enter without calling `workflow.run` again; Temporal-class durability stays out of scope                                                    |
| Agent episode `cacheable`             | Skip re-running identical agent episodes across attempts                                                                                       |
| Mid-stream token resume               | Resume a partial model stream                                                                                                                  |
| Skipped-step file edits               | Run-scoped transcripts are copied when the writer step is skipped. File edits are not. See [`retry-side-effects.md`](./retry-side-effects.md). |
| Copied-bar / nested-expand Playwright | API retry, 409-while-running, and workflow-row Retry are in `retry-attempt.spec.ts`. Visual layout is still manual.                            |

---

## Design constraints (do not reopen without a new reason)

- **Immutable prior forest.** Forest retry always seeds a **new** attempt. Same-`workflowRunId` in-place mutate for retry is superseded (path-stable skip on the same run remains for simple mid-run re-entry only — see the guide).
- **Run-scoped transcripts move with a skip.** `seedRetryAttempt` still writes projections only. When the new attempt skips a step, each recorded `${priorRunId}:${suffix}` transcript is copied onto the new run's suffix. A caller-chosen scope id is not copied. File edits are still [`retry-side-effects.md`](./retry-side-effects.md).
- **Isolated runs stay out of cascade.** `{ isolated: true }` has no `parentWorkflowRunId` and is never seeded into an attempt forest.
- **Seed projections, not event logs.** Copy run/step summaries + outputs and `replayOf*` links; the UI opens the original attempt for full event detail.

---

## Related

- Open backlog pointer: [`near-term-roadmap.md`](./near-term-roadmap.md) §4
- Skipped-step messages and file edits: [`retry-side-effects.md`](./retry-side-effects.md)
- Hosts / SSE: [`inspection-ui.md`](./inspection-ui.md)
