import type { WorkflowContextScope } from "../workflow/workflow-context-scope";
import type { MessageStore } from "./types";

const tracked = Symbol("adl.messageStoreAccess");

/**
 * Record each scope operation on the active workflow frame.
 * The frame is the AsyncLocalStorage context already used for `agent.run`.
 */
export function trackMessageStoreAccess(
  store: MessageStore,
  scope: WorkflowContextScope,
): MessageStore {
  if (tracked in store) {
    return store;
  }

  function note(memoryScope: string): void {
    scope.peek()?.noteMemoryScopeAccessed(memoryScope);
  }

  const wrapped: MessageStore = {
    kind: store.kind,
    async load(memoryScope) {
      note(memoryScope);
      return store.load(memoryScope);
    },
    async save(memoryScope, messages) {
      note(memoryScope);
      await store.save(memoryScope, messages);
    },
    async copy(fromScope, toScope) {
      note(fromScope);
      note(toScope);
      await store.copy(fromScope, toScope);
    },
    async delete(memoryScope) {
      note(memoryScope);
      await store.delete(memoryScope);
    },
    listScopes: () => store.listScopes(),
  };
  Object.defineProperty(wrapped, tracked, { value: true });
  return wrapped;
}
