import { useEffect, useMemo, useRef, useState } from "react";

import { fetchMessagesForScope } from "#/lib/inspector-server";
import {
  latestCommitSeqByScope,
  memoryScopesFromEvents,
  overlayNewerThanPrefetch,
} from "@/lib/run-messages";
import type { MessagesByScope, PrefetchedRunMessages, RunEvent } from "@/lib/view-model/types";

export function useLiveRunMessages(
  runId: string,
  initial: PrefetchedRunMessages,
  events: RunEvent[],
): { messagesByScope: MessagesByScope; pendingScopes: ReadonlySet<string> } {
  const [overlay, setOverlay] = useState<MessagesByScope>({});
  const [pendingScopes, setPendingScopes] = useState<Set<string>>(() => new Set());
  const loadedSeqRef = useRef<Record<string, number>>({});
  const eventsRef = useRef(events);
  eventsRef.current = events;

  useEffect(() => {
    setOverlay({});
    setPendingScopes(new Set());
    loadedSeqRef.current = {};
  }, [runId]);

  useEffect(() => {
    setOverlay((prev) => {
      const next = overlayNewerThanPrefetch(prev, loadedSeqRef.current, initial.eventSeq);
      const prevKeys = Object.keys(prev);
      const nextKeys = Object.keys(next);
      if (prevKeys.length === nextKeys.length && nextKeys.every((key) => prev[key] === next[key])) {
        return prev;
      }
      return next;
    });
    for (const scope of Object.keys(initial.messagesByScope)) {
      const loaded = loadedSeqRef.current[scope];
      if (loaded === undefined || initial.eventSeq >= loaded) {
        loadedSeqRef.current[scope] = initial.eventSeq;
      }
    }
  }, [initial]);

  const fetchKey = useMemo(() => {
    return memoryScopesFromEvents(events)
      .map((scope) => `${scope}:${latestCommitSeqByScope(events)[scope] ?? 0}`)
      .join("|");
  }, [events]);

  useEffect(() => {
    const currentEvents = eventsRef.current;
    const scopes = memoryScopesFromEvents(currentEvents);
    const commitSeqByScope = latestCommitSeqByScope(currentEvents);
    const toFetch = scopes.filter((scope) => {
      const commitSeq = commitSeqByScope[scope] ?? 0;
      const loaded = loadedSeqRef.current[scope];
      if (loaded === undefined) {
        return true;
      }
      return commitSeq > loaded;
    });
    if (toFetch.length === 0) {
      return;
    }

    let cancelled = false;
    setPendingScopes(new Set(toFetch));
    void Promise.all(
      toFetch.map(async (scope) => {
        const messages = await fetchMessagesForScope({ data: scope });
        return [scope, messages, commitSeqByScope[scope] ?? 0] as const;
      }),
    ).then((rows) => {
      if (cancelled) {
        return;
      }
      const next: MessagesByScope = {};
      for (const [scope, messages, seq] of rows) {
        loadedSeqRef.current[scope] = Math.max(loadedSeqRef.current[scope] ?? 0, seq);
        next[scope] = messages;
      }
      setOverlay((prev) => ({ ...prev, ...next }));
      setPendingScopes(new Set());
    });

    return () => {
      cancelled = true;
    };
  }, [fetchKey]);

  return {
    messagesByScope: { ...initial.messagesByScope, ...overlay },
    pendingScopes,
  };
}
