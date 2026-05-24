import type { CoreMessage } from "ai";

import type { MessageStore } from "./types";

/** In-process message store for tests and local scripts. */
export function inMemoryMessageStore(): MessageStore {
  const scopes = new Map<string, CoreMessage[]>();

  return {
    async load(memoryScope) {
      return scopes.get(memoryScope) ?? [];
    },
    async save(memoryScope, messages) {
      scopes.set(memoryScope, [...messages]);
    },
  };
}
