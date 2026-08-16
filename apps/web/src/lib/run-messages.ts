import type { RunEvent } from "@/lib/mock/types";

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
      latest[event.memoryScope] = event.seq;
    }
  }
  return latest;
}
