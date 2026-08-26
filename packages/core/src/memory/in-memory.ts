import type { CoreMessage } from "ai";

import type { MessageStore } from "./types";

/**
 * In-process {@link MessageStore} for tests, local scripts, and the default when
 * `createAdlRuntime()` omits `stores.message`. Not durable across process restarts.
 */
export function inMemoryMessageStore(): MessageStore {
  const scopes = new Map<string, CoreMessage[]>();

  return {
    kind: "in-memory",
    async load(memoryScope) {
      return scopes.get(memoryScope) ?? [];
    },
    async save(memoryScope, messages) {
      scopes.set(memoryScope, [...messages]);
    },
    async delete(memoryScope) {
      scopes.delete(memoryScope);
    },
    async listScopes() {
      return [...scopes.keys()];
    },
  };
}
