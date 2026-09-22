# Retry side effects (deferred)

**Status:** Not implemented. API not pinned. Last reconciled: **2026-09-22**.

Attempt lineage copies workflow projections. It does not carry a step's other mutations onto the new attempt. This note is that gap. The shipped retry contract stays in the [workflows guide](../apps/docs/src/content/docs/core/workflows.md#resumability).

## What a seed copies today

`seedRetryAttempt` writes run and step projections (`materializeAttemptRun`, `materializeAttemptStep`): outputs, paths, `pure`, `replayOf*` links, and the scopes that step accessed. It does not call `MessageStore.copy`.

`MessageStore.copy(from, to)` copies a saved transcript onto an empty scope. Inside a workflow, load, save, copy, and delete on the runtime message store are noted on the active AsyncLocalStorage frame and stored on that step as `memoryScopes`.

`ctx.memoryScopeWithSuffix(suffix)` is `${workflowRunId}:${suffix}`. The new attempt has a new `workflowRunId`, so the helper names a new scope. Messages saved under the prior attempt's suffix stay on the old scope. The skipped step does not run again, so nothing writes them onto the new scope.

A scope id the caller chose, one that does not include `workflowRunId`, is ordinary store state. Those rows remain under that id. A later `agent.run` on the same id loads them. Seed does not copy them.

## Messages on a reused scope

A later step that reuses a scope must see the messages earlier steps wrote, including when those earlier steps are skipped.

Appending to `MessageStore` makes a step look impure. Resume still needs to treat that step as pure: skip the callback, do not call the model again, and leave the prior messages available to the rest of the attempt. `pure: false` re-executes the step, which is the opposite of this.

## Mutations beyond the return value

A step needs a way to record mutations it made so a skip counts as already applied. The step must not have to return those mutations as its output.

File edits are the case that forces the API. The bytes live on disk. A later step needs them there when the editing step is skipped. The same record should cover message appends and any other mutation a step wants retry to treat as done.

This is not the [memory pipeline](./memory-pipeline.md). That shapes the list sent to the model. It does not decide what a skipped step already did.

## Revisit `WorkflowStore` first

Do this before the mutation record becomes more methods on [`WorkflowStore`](../packages/core/src/observability/workflow-store.ts).

The interface is already the persistence port and the retry write-back port. `seedRetryAttempt` on the in-memory and SQLite stores delegates to `seedRetryAttemptOnStore`, which then calls `materializeAttemptRun` and `materializeAttemptStep` on that same store. `listDescendantRuns` and `listStepRecords` were added the same way. A custom store implements every one of them.

The mutation record (messages, file edits, anything a skipped step should count as already applied) needs a home. Putting it on `WorkflowStore` as another required family repeats this shape. Revisit the interface first: what a store must persist, and what the attempt seed is allowed to ask it to write. The replacement shape is not pinned.

## Open

- Seed still does not call `MessageStore.copy`. The step's `memoryScopes` are the source ids. The new attempt's `memoryScopeWithSuffix` is a different id until something copies onto it. A scope id that stays stable when the writing step is skipped is the other option. The requirement is that the later step can load the messages without the writer running again.
- What a step registers as a mutation, and how a file write is recognized as already applied.
- How that record interacts with `pure: false`, which must still re-execute.
- Where the mutation record lives after `WorkflowStore` is revisited, so it is not another required method family on that interface.
