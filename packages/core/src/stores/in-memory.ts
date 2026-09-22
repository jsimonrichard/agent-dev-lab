import type { ModelMessage } from "ai";

import { AdlError } from "../errors";
import type { MessageStore } from "./types";

/**
 * In-process {@link MessageStore} for tests, local scripts, and the default when
 * `createAdlRuntime()` omits `stores.message`. Not durable across process restarts.
 */
export function inMemoryMessageStore(): MessageStore {
  const scopes = new Map<string, ModelMessage[]>();

  return {
    kind: "in-memory",
    async load(memoryScope) {
      return scopes.get(memoryScope) ?? [];
    },
    async save(memoryScope, messages) {
      scopes.set(memoryScope, [...messages]);
    },
    async copy(fromScope, toScope) {
      if (fromScope === toScope) {
        return;
      }
      const source = scopes.get(fromScope);
      if (source === undefined) {
        throw new AdlError("INVALID_INPUT", `MessageStore.copy: no transcript for "${fromScope}"`);
      }
      if (scopes.has(toScope)) {
        throw new AdlError(
          "INVALID_INPUT",
          `MessageStore.copy: "${toScope}" already has a transcript`,
        );
      }
      scopes.set(toScope, structuredClone(source));
    },
    async delete(memoryScope) {
      scopes.delete(memoryScope);
    },
    async listScopes() {
      return [...scopes.keys()];
    },
  };
}
