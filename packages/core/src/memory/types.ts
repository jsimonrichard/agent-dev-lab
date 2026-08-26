import type { CoreMessage } from "ai";

/**
 * Persistent or in-process storage for a **conversation transcript** keyed by
 * `memoryScope` on {@link AgentRunInput}.
 *
 * **Role:** supplies `CoreMessage[]` to the model on the next `agent.run`.
 * Separate from {@link WorkflowStore} (run/step observability). Do not rebuild
 * agent memory by replaying run events.
 *
 * The agent runner: `load` → append user / `response.messages` → `save`.
 * On a new `memoryScope`, the resolved system prompt is stored as the first
 * message; later episodes reuse that pinned text (also passed via `system`).
 * `context` on `agent.run()` is not stored here.
 *
 * Configure via `createAdlRuntime({ stores: { message } })` or per-agent
 * `adl.createAgent({ memory: { store } })`.
 *
 * @see {@link inMemoryMessageStore}
 * @see {@link inspectMessageStoreKind}
 */
export interface MessageStore {
  /**
   * Inspector-facing backend id. Built-ins set `"in-memory"` or `"sqlite"`.
   * Custom stores may set any string; {@link inspectMessageStoreKind} reports
   * `"custom"` when this is omitted.
   */
  readonly kind?: string;

  /** Full transcript for this scope (empty array when new). */
  load(memoryScope: string): Promise<CoreMessage[]>;

  /** Replace the transcript after the runner merges new messages. */
  save(memoryScope: string, messages: CoreMessage[]): Promise<void>;

  /** Drop the transcript for this scope. */
  delete(memoryScope: string): Promise<void>;

  /** Memory scopes that have a saved transcript (for inspector rebuild). */
  listScopes(): Promise<string[]>;
}
