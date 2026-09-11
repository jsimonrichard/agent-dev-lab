---
"@agent-dev-lab/core": patch
---

Streaming tools now emit `preliminary: true` on intermediate `AgentToolResultEvent`s. `createAsyncChannel` is a public export for bridging push sources into an `AsyncIterable`.
