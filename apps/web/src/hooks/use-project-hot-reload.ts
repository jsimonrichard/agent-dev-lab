import { useEffect, useRef } from "react";
import { useRouter } from "@tanstack/react-router";

import type { ProjectReloadEvent } from "#/lib/project-reload-types";

const RECONNECT_MS = 1_000;

/** Invalidate app loaders when the ADL project registry hot-reloads. */
export function useProjectHotReload(): void {
  const router = useRouter();
  const snapshotRef = useRef<{ generation: number; lastReloadError: string | null } | null>(null);

  useEffect(() => {
    let source: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let closed = false;

    const connect = () => {
      if (closed) {
        return;
      }
      source?.close();
      source = new EventSource("/api/project/events");

      source.onmessage = (message) => {
        try {
          const event = JSON.parse(message.data) as ProjectReloadEvent;
          if (event.type === "reload" || event.type === "error") {
            snapshotRef.current = {
              generation: event.generation,
              lastReloadError: event.type === "error" ? event.message : null,
            };
            void router.invalidate({ sync: true });
            return;
          }
          if (event.type === "snapshot") {
            const previous = snapshotRef.current;
            snapshotRef.current = {
              generation: event.generation,
              lastReloadError: event.lastReloadError,
            };
            if (
              previous &&
              (previous.generation !== event.generation ||
                previous.lastReloadError !== event.lastReloadError)
            ) {
              void router.invalidate();
            }
          }
        } catch {
          // ignore malformed chunks
        }
      };

      source.onerror = () => {
        source?.close();
        source = null;
        if (closed || reconnectTimer) {
          return;
        }
        reconnectTimer = setTimeout(() => {
          reconnectTimer = undefined;
          connect();
        }, RECONNECT_MS);
      };
    };

    connect();

    return () => {
      closed = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      source?.close();
    };
  }, [router]);
}
