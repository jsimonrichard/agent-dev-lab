# Memory pipeline (deferred)

**Status:** Design direction agreed; **API not pinned**. Do not implement in the first runtime iteration(s).

## Intent

Between loading stored messages and calling the AI SDK, ADL needs a hook to shape the message list (e.g. `lastMessages(n)`, future summarization, pruning). This should operate only on `ModelMessage` / `CoreMessage` arrays—not on templates or storage keys.

## Likely shape (non-final)

- **`MessageStore`**: `load(memoryScope) → messages`, `save(memoryScope, messages)` (or append-oriented API TBD).
- **`MemoryPipeline`**: `(ctx) => Promise<ModelMessage[]>` where `ctx` includes `stored`, `incoming`, `memoryScope`, and run metadata (`runId`, `stepPath`).
- **Built-in presets** (later): `lastMessages(n)`, `passthrough`, `compose(...)`.

## Open questions (resolve before implementation)

1. Run pipeline **before** or **after** system bootstrap and user append?
2. `save` whole list vs append-only event log with projection?
3. Single pipeline on agent definition vs override per `run()`?
4. How pipelines interact with persisted system messages (never drop system without explicit policy)?

## References

- Agent run flow: [agents guide](../apps/docs/src/content/docs/core/agents.md)
- Message store contract: [`MessageStore`](../packages/core/src/memory/types.ts)
- Mastra uses processor-style `MessageHistory` on a message list; ADL may adopt a similar _idea_ with a simpler function pipeline once the above is settled.
