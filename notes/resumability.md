# Resumability (deferred)

Attempt lineage is **shipped**: new-attempt seed (`seedRetryAttempt`), path-stable step skip, `StepOptions.pure`, nested forests (`parentWorkflowRunId` / `parentStepId`), and inspection-UI Retry. User-facing contract lives in the [workflows guide — Resumability](../apps/docs/src/content/docs/core/workflows.md#resumability). Do not restate that API here.

Last reconciled: **2026-09-21**.

---

## Still open

| Item                                  | Notes                                                                                       |
| ------------------------------------- | ------------------------------------------------------------------------------------------- |
| Crash mid-closure / `ctx.checkpoint`  | Re-enter without calling `workflow.run` again; Temporal-class durability stays out of scope |
| Agent episode `cacheable`             | Skip re-running identical agent episodes across attempts                                    |
| Mid-stream token resume               | Resume a partial model stream                                                               |
| Retry / lineage Playwright validation | `apps/web/e2e/retry-attempt.spec.ts` exists; full e2e confidence not finished yet           |

---

## Design constraints (do not reopen without a new reason)

- **Immutable prior forest.** Forest retry always seeds a **new** attempt. Same-`workflowRunId` in-place mutate for retry is superseded (path-stable skip on the same run remains for simple mid-run re-entry only — see the guide).
- **`MessageStore` is not resume.** Same `memoryScope` on a later `agent.run` is ordinary memory; on step re-exec the host chooses continue / fork / clear.
- **Isolated runs stay out of cascade.** `{ isolated: true }` has no `parentWorkflowRunId` and is never seeded into an attempt forest.
- **Seed projections, not event logs.** Copy run/step summaries + outputs and `replayOf*` links; the UI opens the original attempt for full event detail.

---

## Related

- Open backlog pointer: [`near-term-roadmap.md`](./near-term-roadmap.md) §4
- Hosts / SSE: [`inspection-ui.md`](./inspection-ui.md)
