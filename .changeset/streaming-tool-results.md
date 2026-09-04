---
"@agent-dev-lab/core": patch
---

Support tools whose `execute` streams progress before finishing: the AI SDK already lets a tool's `execute` return an `AsyncIterable` instead of a single `Promise` (every yielded value becomes a `preliminary` tool-result, the last one becomes the real one), but `AgentImpl`'s event emission previously treated every `tool-result` chunk as final. `AgentToolResultEvent` now carries `preliminary?: boolean`, passed straight through from the AI SDK's own `chunk.preliminary` — a consumer that only wants the finished result should filter `!event.preliminary`. None of this changes what reaches the model itself: preliminary tool-results were already excluded from conversation history by the AI SDK, only the observability event stream needed to catch up.

Also promotes the push→pull `AsyncChannel`/`createAsyncChannel` helper (previously a private detail of `agent.stream()`'s `textStream`/`fullStream`) to a public, documented export — useful for bridging an event-emitter-based source (a spawned process's `stdout`/`stderr`, a websocket, ...) into the `AsyncIterable` shape a streaming tool's `execute` needs to return.
