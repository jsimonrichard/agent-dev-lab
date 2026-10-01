import { useEffect, useMemo, useRef, useState } from "react";

import type { RunEvent as CoreRunEvent } from "@agent-dev-lab/core";
import { isEpisodeTimingEvent } from "@agent-dev-lab/core/episode-timing";

import type { RunEvent } from "#/lib/view-model/types";
import { adaptCoreEventsForWorkflowRun } from "#/lib/event-log/event-adapter";
import {
  episodeTimingMapFromEvents,
  toEpisodeTimingEventDto,
  type EpisodeTimingEventDto,
} from "@/lib/view-model/attach-episode-timing";

function isWorkflowRunTerminal(event: RunEvent): boolean {
  return (
    event.type === "run_finished" || event.type === "run_failed" || event.type === "run_cancelled"
  );
}

function mergeTimingDtos(
  prev: EpisodeTimingEventDto[],
  next: EpisodeTimingEventDto,
): EpisodeTimingEventDto[] {
  if (prev.some((event) => event.runSeq === next.runSeq)) {
    return prev;
  }
  return [...prev, next];
}

export function useWorkflowRunEvents(
  runId: string,
  initialEvents: RunEvent[] = [],
  initialTimingEvents: EpisodeTimingEventDto[] = [],
) {
  const [events, setEvents] = useState<RunEvent[]>(initialEvents);
  const [timingEvents, setTimingEvents] =
    useState<EpisodeTimingEventDto[]>(initialTimingEvents);
  const lastSeqRef = useRef(initialEvents.reduce((max, e) => Math.max(max, e.runSeq), 0));
  const seededRunIdRef = useRef(runId);

  useEffect(() => {
    const initialMax = initialEvents.reduce((max, e) => Math.max(max, e.runSeq), 0);
    const runChanged = seededRunIdRef.current !== runId;
    seededRunIdRef.current = runId;
    setEvents((prev) => {
      if (runChanged) {
        return initialEvents;
      }
      const prevMax = prev.reduce((max, e) => Math.max(max, e.runSeq), 0);
      // Loader refreshes (sidebar invalidate) often rebuild `initialEvents` with the
      // same tip seq. Replacing state would re-trigger dependents that invalidate.
      if (initialMax < prevMax) {
        return prev;
      }
      if (initialMax === prevMax && prev.length >= initialEvents.length) {
        return prev;
      }
      return initialEvents;
    });
    setTimingEvents((prev) => {
      if (runChanged) {
        return initialTimingEvents;
      }
      const prevMax = prev.reduce((max, e) => Math.max(max, e.runSeq), 0);
      const seedMax = initialTimingEvents.reduce((max, e) => Math.max(max, e.runSeq), 0);
      if (seedMax < prevMax) {
        return prev;
      }
      if (seedMax === prevMax && prev.length >= initialTimingEvents.length) {
        return prev;
      }
      return initialTimingEvents;
    });
    lastSeqRef.current = runChanged ? initialMax : Math.max(lastSeqRef.current, initialMax);
  }, [runId, initialEvents, initialTimingEvents]);

  useEffect(() => {
    const source = new EventSource(
      `/api/runs/${encodeURIComponent(runId)}/events?afterSeq=${lastSeqRef.current}`,
    );

    source.onmessage = (message) => {
      try {
        const core = JSON.parse(message.data) as CoreRunEvent;
        lastSeqRef.current = Math.max(lastSeqRef.current, core.runSeq);
        if (isEpisodeTimingEvent(core)) {
          const dto = toEpisodeTimingEventDto(core);
          if (dto) {
            setTimingEvents((prev) => mergeTimingDtos(prev, dto));
          }
        }
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

  const episodeTiming = useMemo(
    () => episodeTimingMapFromEvents(timingEvents, Date.now()),
    [timingEvents],
  );

  return { events, timingEvents, episodeTiming };
}
