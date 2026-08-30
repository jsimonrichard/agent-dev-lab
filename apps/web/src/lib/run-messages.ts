import type { MessagesByScope, RunEvent } from "@/lib/view-model/types";

export function memoryScopesFromEvents(events: RunEvent[]): string[] {
  const scopes: string[] = [];
  const seen = new Set<string>();
  for (const event of events) {
    if (event.type !== "agent_started" && event.type !== "messages_committed") {
      continue;
    }
    if (seen.has(event.memoryScope)) {
      continue;
    }
    seen.add(event.memoryScope);
    scopes.push(event.memoryScope);
  }
  return scopes;
}

export function latestCommitSeqByScope(events: RunEvent[]): Record<string, number> {
  const latest: Record<string, number> = {};
  for (const event of events) {
    if (event.type === "messages_committed") {
      latest[event.memoryScope] = event.runSeq;
    }
  }
  return latest;
}

/** Keep live-fetched transcripts only when they are newer than a refreshed prefetch snapshot. */
export function overlayNewerThanPrefetch(
  overlay: MessagesByScope,
  overlaySeqByScope: Record<string, number>,
  prefetchEventSeq: number,
): MessagesByScope {
  const next: MessagesByScope = {};
  for (const [scope, messages] of Object.entries(overlay)) {
    const overlaySeq = overlaySeqByScope[scope];
    if (overlaySeq !== undefined && overlaySeq > prefetchEventSeq) {
      next[scope] = messages;
    }
  }
  return next;
}
