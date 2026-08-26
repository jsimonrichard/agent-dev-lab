import { useEffect, useRef, useState } from "react";

import type { LoggedRunEvent } from "@agent-dev-lab/core";

/**
 * Subscribes to the process-wide event log via SSE (`GET /api/events`).
 */
export function useProcessEventLog(initialEvents: LoggedRunEvent[] = []) {
  const [events, setEvents] = useState<LoggedRunEvent[]>(initialEvents);
  const lastSeqRef = useRef(initialEvents.reduce((max, entry) => Math.max(max, entry.logSeq), 0));

  useEffect(() => {
    const source = new EventSource(`/api/events?afterSeq=${lastSeqRef.current}`);

    source.onmessage = (message) => {
      try {
        const entry = JSON.parse(message.data) as LoggedRunEvent;
        if (typeof entry.logSeq !== "number" || entry.event == null) {
          return;
        }
        lastSeqRef.current = Math.max(lastSeqRef.current, entry.logSeq);
        setEvents((prev) => {
          if (prev.some((existing) => existing.logSeq === entry.logSeq)) {
            return prev;
          }
          return [...prev, entry];
        });
      } catch {
        // ignore malformed chunks
      }
    };

    return () => {
      source.close();
    };
  }, []);

  return { events, setEvents };
}
