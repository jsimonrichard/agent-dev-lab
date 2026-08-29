import {
  type EventLog,
  type InMemoryEventLog,
  type ListLoggedEventsFilter,
  type LoggedRunEvent,
  type RunEvent,
  type WorkflowStore,
} from "@agent-dev-lab/core";
import { getInspectorEventLog, markInspectorEventLogHydrated } from "@agent-dev-lab/core/project";

import type { EventLogSnapshotEntry } from "#/lib/event-log/event-log-snapshot";

export type { EventLogSnapshotEntry } from "#/lib/event-log/event-log-snapshot";

/**
 * Process singleton — pinned on the core project host so Vite SSR isolates
 * share one ring buffer (`@agent-dev-lab/core/project` is `ssr.external`).
 */
export function getEventLog(): InMemoryEventLog {
  return getInspectorEventLog();
}

/**
 * Fill an empty in-memory log from persisted runs so a process restart still
 * shows history. Runs once per process-host generation (Clear must stick).
 */
export async function hydrateEventLogFromWorkflowStore(
  store: WorkflowStore,
  eventLog: InMemoryEventLog = getEventLog(),
): Promise<void> {
  const isProcessLog = eventLog === getEventLog();
  if (isProcessLog && !markInspectorEventLogHydrated()) {
    // Already filled this process. An empty log means the user cleared — leave it.
    // A non-empty log may be missing episodes that persisted after the first fill
    // (standalone agent.run while observers were not yet attached).
    if (eventLog.list().length === 0) {
      return;
    }
    await mergeStoredRunEvents(store, eventLog);
    return;
  }
  if (eventLog.list().length > 0) {
    await mergeStoredRunEvents(store, eventLog);
    return;
  }
  for (const event of await collectStoredRunEvents(store)) {
    eventLog.onEvent(event);
  }
}

function storedEventKey(event: RunEvent): string {
  if ("workflowRunId" in event && event.workflowRunId) {
    return `wf:${event.workflowRunId}:${event.seq}:${event.type}:${event.at}`;
  }
  if ("agentCallId" in event) {
    return `ag:${event.agentCallId}:${event.seq}:${event.type}:${event.at}`;
  }
  return `other:${event.type}:${event.seq}:${event.at}`;
}

async function mergeStoredRunEvents(
  store: WorkflowStore,
  eventLog: InMemoryEventLog,
): Promise<void> {
  const seen = new Set(eventLog.list().map((entry) => storedEventKey(entry.event)));
  for (const event of await collectStoredRunEvents(store)) {
    const key = storedEventKey(event);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    eventLog.onEvent(event);
  }
}

async function collectStoredRunEvents(store: WorkflowStore): Promise<RunEvent[]> {
  const runs = await store.listRuns({ limit: 100 });
  const collected: RunEvent[] = [];
  const seenAgentCalls = new Set<string>();

  for (const run of runs) {
    const events = await store.listEvents({ workflowRunId: run.workflowRunId });
    collected.push(...events);
    for (const event of events) {
      if ("agentCallId" in event) {
        seenAgentCalls.add(event.agentCallId);
      }
    }
  }

  const episodes = await store.listAgentEpisodes({ limit: 100 });
  for (const episode of episodes) {
    if (episode.workflowRunId || seenAgentCalls.has(episode.agentCallId)) {
      continue;
    }
    collected.push(...(await store.listEvents({ agentCallId: episode.agentCallId })));
  }

  collected.sort((left, right) => {
    const byTime = left.at.localeCompare(right.at);
    return byTime !== 0 ? byTime : left.seq - right.seq;
  });
  return collected;
}

/**
 * JSON-cloned snapshot of the in-memory log for TanStack Start loaders.
 * Omitting `filter` returns the full ring buffer (up to `DEFAULT_EVENT_LOG_MAX_EVENTS`).
 */
export function snapshotEventLog(filter?: ListLoggedEventsFilter): EventLogSnapshotEntry[] {
  return JSON.parse(JSON.stringify(getEventLog().list(filter))) as EventLogSnapshotEntry[];
}

/**
 * Push every event after `afterSeq`, then block on {@link EventLog.waitForAppend}
 * until another event arrives or `signal` aborts. `onEvent` returning false stops the tail.
 */
export async function tailLoggedEvents(
  eventLog: EventLog,
  afterSeq: number,
  onEvent: (entry: LoggedRunEvent) => boolean,
  signal?: AbortSignal,
): Promise<void> {
  let cursor = afterSeq;
  while (!signal?.aborted) {
    const events = eventLog.list({ afterSeq: cursor });
    for (const entry of events) {
      if (signal?.aborted) {
        return;
      }
      cursor = entry.logSeq;
      if (!onEvent(entry)) {
        return;
      }
    }
    if (signal?.aborted) {
      return;
    }
    await eventLog.waitForAppend(cursor, signal);
  }
}
