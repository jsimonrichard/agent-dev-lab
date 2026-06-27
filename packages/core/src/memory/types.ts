import type { CoreMessage } from "ai";

/**
 * Persistent or in-process storage for a conversation transcript keyed by `memoryScope`.
 * @see apps/docs — core/message-store
 */
export interface MessageStore {
  load(memoryScope: string): Promise<CoreMessage[]>;
  save(memoryScope: string, messages: CoreMessage[]): Promise<void>;
}
