# Retry side effects (deferred)

**Status:** Run-scoped message carry is implemented. File edits and the `WorkflowStore` revisit are not. Last reconciled: **2026-09-22**.

Attempt lineage copies workflow projections. It does not carry a step's other mutations onto the new attempt. This note is that gap. The shipped retry contract stays in the [workflows guide](../apps/docs/src/content/docs/core/workflows.md#resumability).

## What a seed copies today

`seedRetryAttempt` writes run and step projections (`materializeAttemptRun`, `materializeAttemptStep`): outputs, paths, `pure`, `replayOf*` links, and the scopes that step accessed. It does not call `MessageStore.copy`. The copy happens when the new attempt **skips** the step: each recorded `${priorRunId}:${suffix}` transcript is copied onto `${newRunId}:${suffix}`. A scope id that does not start with a prior run id stays on that same row.

`ctx.memoryScopeWithSuffix(suffix)` is `${workflowRunId}:${suffix}`. The new attempt has a new `workflowRunId`, so the helper names a new scope. The skipped step's transcript is what fills it. A step that re-executes does not get that copy; it starts on the empty new scope.

## Messages on a reused scope

Shipped for `memoryScopeWithSuffix`. Skipping the writer copies its transcript onto the new attempt's suffix. The callback does not run, and the model is not called again. `pure: false` still re-executes that step, and the re-execution starts on an empty new scope.

## Mutations beyond the return value

A step needs a way to record mutations it made so a skip counts as already applied. The step must not have to return those mutations as its output.

File edits are the case that forces the API. The bytes live on disk. A later step needs them there when the editing step is skipped.

This is not the [memory pipeline](./memory-pipeline.md). That shapes the list sent to the model. It does not decide what a skipped step already did.

## Revisit `WorkflowStore` first

Do this before the mutation record becomes more methods on [`WorkflowStore`](../packages/core/src/observability/workflow-store.ts).

The interface is already the persistence port and the retry write-back port. `seedRetryAttempt` on the in-memory and SQLite stores delegates to `seedRetryAttemptOnStore`, which then calls `materializeAttemptRun` and `materializeAttemptStep` on that same store. `listDescendantRuns` and `listStepRecords` were added the same way. A custom store implements every one of them.

The mutation record (messages, file edits, anything a skipped step should count as already applied) needs a home. Putting it on `WorkflowStore` as another required family repeats this shape. Revisit the interface first: what a store must persist, and what the attempt seed is allowed to ask it to write. The replacement shape is not pinned.

## Open

- A fully replayed nested run returns its seeded output without re-entering its steps, so those inner scopes are not copied until a later attempt actually skips them.
- What a step registers as a mutation, and how a file write is recognized as already applied.
- How that record interacts with `pure: false`, which must still re-execute.
- Where the mutation record lives after `WorkflowStore` is revisited, so it is not another required method family on that interface.
