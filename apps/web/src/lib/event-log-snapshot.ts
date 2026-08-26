import type { LoggedRunEvent } from "@agent-dev-lab/core";

import type { JsonValue } from "#/lib/mock/types";

/**
 * JSON-cloned log row for TanStack Start loaders. Core `RunEvent.input` is `unknown`,
 * which Start does not treat as serializable, so the wire type is a JSON record.
 */
export type EventLogSnapshotEntry = {
  logSeq: number;
  event: { [key: string]: JsonValue };
};

/** Rehydrate a loader snapshot as {@link LoggedRunEvent}s (JSON clone of the in-memory log). */
export function loggedRunEventsFromSnapshot(entries: EventLogSnapshotEntry[]): LoggedRunEvent[] {
  return entries as unknown as LoggedRunEvent[];
}
