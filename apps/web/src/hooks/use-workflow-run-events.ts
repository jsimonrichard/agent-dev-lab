import { useEffect, useRef, useState } from "react";

import type { RunEvent } from "#/lib/view-model/types";
import { adaptCoreEventsForWorkflowRun } from "#/lib/event-log/event-adapter";
import type { RunEvent as CoreRunEvent } from "@agent-dev-lab/core";

function isWorkflowRunTerminal(event: RunEvent): boolean {
  return (
    event.type === "run_finished" || event.type === "run_failed" || event.type === "run_cancelled"
  );
}

export function useWorkflowRunEvents(runId: string, initialEvents: RunEvent[] = []) {
  const [events, setEvents] = useState<RunEvent[]>(initialEvents);
  const lastSeqRef = useRef(initialEvents.reduce((max, e) => Math.max(max, e.runSeq), 0));

  useEffect(() => {
    setEvents(initialEvents);
    lastSeqRef.current = initialEvents.reduce((max, e) => Math.max(max, e.runSeq), 0);
  }, [runId, initialEvents]);

  useEffect(() => {
    const source = new EventSource(
      `/api/runs/${encodeURIComponent(runId)}/events?afterSeq=${lastSeqRef.current}`,
    );

    source.onmessage = (message) => {
      try {
        const core = JSON.parse(message.data) as CoreRunEvent;
        lastSeqRef.current = Math.max(lastSeqRef.current, core.runSeq);
        const adapted = adaptCoreEventsForWorkflowRun(runId, [core]);
        if (adapted.length === 0) {
          return;
        }
        const uiEvent = adapted[0]!;
        setEvents((prev) => {
          if (prev.some((e) => e.runSeq === uiEvent.runSeq)) {
            return prev;
          }
          return [...prev, uiEvent];
        });
        if (isWorkflowRunTerminal(uiEvent)) {
          source.close();
        }
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
