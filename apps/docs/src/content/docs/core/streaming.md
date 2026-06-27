---
title: Streaming
description: Run events, agent.stream, and planned inspection UI feeds.
---

ADL exposes two channels: **run events** (always) and **model token streams** (optional).

## Two channels

| Channel          | What moves                                            | When needed                                          |
| ---------------- | ----------------------------------------------------- | ---------------------------------------------------- |
| **Run events**   | Step tree, agent episodes, errors, committed messages | Waterfall / tracing UI — even for non-streaming runs |
| **Model stream** | Token deltas from `streamText`                        | Live text preview during an agent call               |

The UI needs **run events** on every path. **Model stream** exists when using `agent.stream` or when the runner emits `agent_text_delta`.

## Run events

Monotonic `seq` per event stream scope (`workflowRunId` or `agentCallId`).

| `type`                                                                              | Purpose                            |
| ----------------------------------------------------------------------------------- | ---------------------------------- |
| `workflow_started` / `workflow_finished` / `workflow_failed` / `workflow_cancelled` | Workflow lifecycle                 |
| `step_started` / `step_finished` / `step_skipped` / `step_failed`                   | Step tree                          |
| `agent_started` / `agent_finished` / `agent_failed`                                 | Agent episodes                     |
| `agent_text_delta`                                                                  | Streaming model output             |
| `agent_messages_committed`                                                          | After `MessageStore` save          |
| `custom`                                                                            | Application-defined via `ctx.emit` |

Events are JSON-serializable for storage and future SSE.

## One implementation path: streamText

Both `agent.run` and `agent.stream` use **`streamText`** internally:

| Public API         | Caller sees                      | Runner behavior                           |
| ------------------ | -------------------------------- | ----------------------------------------- |
| **`agent.run`**    | `AgentRunHandle`                 | Drains stream; observers still get deltas |
| **`agent.stream`** | SDK streams + `finished` promise | Exposes `textStream` / `fullStream`       |

`workflow.run` and `workflow.stream` share the same event sink; `workflow.stream` yields live events via async iterator.

## Custom events

Inside an active step:

```ts
await ctx.step("ingest", async ({ ctx }) => {
  ctx.emit({
    type: "custom",
    name: "files_scanned",
    payload: { count: 42 },
  });
});
```

`ctx.emit` requires an active step (`stepId`, `workflowRunId`). Payload must be JSON-serializable.

## Subscribing to a run

```ts
const handle = workflow.run(input);
// handle.workflowRunId — available immediately
const events = workflow.stream(input);
for await (const event of events.events) {
  // live tail
}
const output = await handle.result;
```

Historical replay: `workflowStore.listEvents({ workflowRunId })`.

## Planned HTTP (apps/web)

Not implemented yet. Intended shape:

| Route                      | Behavior                                        |
| -------------------------- | ----------------------------------------------- |
| `POST /api/runs`           | Start workflow → `{ workflowRunId }`            |
| `GET /api/runs/:id/events` | SSE of persisted events; `?afterSeq=` reconnect |
| `GET /api/runs/:id`        | Snapshot status + output                        |

Detail for coding agents: `notes/inspection-ui.md`.

## Cancellation

`handle.cancel()` and `AbortSignal` on run options are partially wired — signal is not yet propagated through steps and child agents. See [Workflows](/core/workflows/) limitations.

## Implementation status

| Piece                             | Status                              |
| --------------------------------- | ----------------------------------- |
| `RunEvent` union + `RunRecorder`  | Implemented                         |
| `agent_text_delta` from `onChunk` | Implemented                         |
| `workflow.stream()` event tail    | Implemented                         |
| SSE routes in `apps/web`          | Not implemented                     |
| SQLite event persistence          | Not implemented (in-memory default) |

See [Observability](/core/observability/) for store interfaces.
