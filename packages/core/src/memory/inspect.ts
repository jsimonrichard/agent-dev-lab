import type { MessageStore } from "./types";

/** Fallback when a {@link MessageStore} does not set {@link MessageStore.kind}. */
export const CUSTOM_MESSAGE_STORE_KIND = "custom";

/**
 * Backend id for a message store (`"in-memory"`, `"sqlite"`, a custom `kind`,
 * or `"custom"` when `kind` is omitted).
 */
export function inspectMessageStoreKind(store: Pick<MessageStore, "kind"> | undefined): string {
  const kind = store?.kind?.trim();
  return kind ? kind : CUSTOM_MESSAGE_STORE_KIND;
}
