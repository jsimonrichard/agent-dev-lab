import type { CoreMessage } from "ai";

/**
 * Persistent or in-process storage for a **conversation transcript** keyed by
 * `memoryScope` on {@link AgentRunInput}.
 *
 * **Role:** supplies `CoreMessage[]` to the model on the next `agent.run`.
 * Separate from {@link WorkflowStore} (run/step observability). Do not rebuild
 * agent memory by replaying run events.
 *
 * The agent runner: `load` → bootstrap system message when empty → append user /
 * `response.messages` → `save`. `context` on `agent.run()` is not stored here.
 *
 * Configure via `createAdlRuntime({ stores: { message } })` or per-agent
 * `createAgent({ memory: { store } })`.
 *
 * @see {@link inMemoryMessageStore}
 */
export interface MessageStore {
  /** Full transcript for this scope (empty array when new). */
  load(memoryScope: string): Promise<CoreMessage[]>;

  /** Replace the transcript after the runner merges new messages. */
  save(memoryScope: string, messages: CoreMessage[]): Promise<void>;
}
