import { useEffect, useRef, useState } from "react";

import type { RunEvent } from "#/lib/mock/types";
import { adaptCoreEventsForWorkflowRun } from "#/lib/event-adapter";
import type { RunEvent as CoreRunEvent } from "@agent-dev-lab/core";

export function useWorkflowRunEvents(runId: string, initialEvents: RunEvent[] = []) {
  const [events, setEvents] = useState<RunEvent[]>(initialEvents);
  const lastSeqRef = useRef(initialEvents.reduce((max, e) => Math.max(max, e.seq), 0));

  useEffect(() => {
    setEvents(initialEvents);
    lastSeqRef.current = initialEvents.reduce((max, e) => Math.max(max, e.seq), 0);
  }, [runId, initialEvents]);

  useEffect(() => {
    const source = new EventSource(
      `/api/runs/${encodeURIComponent(runId)}/events?afterSeq=${lastSeqRef.current}`,
    );

    source.onmessage = (message) => {
      try {
        const core = JSON.parse(message.data) as CoreRunEvent;
        const adapted = adaptCoreEventsForWorkflowRun(runId, [core]);
        if (adapted.length === 0) {
          return;
        }
        const uiEvent = adapted[0]!;
        lastSeqRef.current = Math.max(lastSeqRef.current, uiEvent.seq);
        setEvents((prev) => {
          if (prev.some((e) => e.seq === uiEvent.seq)) {
            return prev;
          }
          return [...prev, uiEvent];
        });
      } catch {
        // ignore malformed chunks
      }
    };

    return () => {
      source.close();
    };
  }, [runId]);

  return events;
}
