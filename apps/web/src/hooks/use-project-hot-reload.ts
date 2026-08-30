import { useEffect, useRef, useState } from "react";
import { useRouter } from "@tanstack/react-router";

import type {
  InspectorConnectionState,
  InspectorServerShutdownReason,
} from "#/lib/inspector-connection";
import type { ProjectReloadEvent } from "#/lib/project-reload-types";

const RECONNECT_MS = 1_000;

/**
 * Subscribes to `/api/project/events` for registry hot-reload and serve shutdown.
 * Returns connection state so the shell can freeze live UI when the server exits.
 */
export function useProjectHotReload(): InspectorConnectionState {
  const router = useRouter();
  const snapshotRef = useRef<{ generation: number; lastReloadError: string | null } | null>(null);
  const [connection, setConnection] = useState<InspectorConnectionState>({
    offline: false,
    reason: null,
  });
  const offlineRef = useRef(false);

  useEffect(() => {
    let source: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let closed = false;

    const markOffline = (reason: InspectorServerShutdownReason) => {
      offlineRef.current = true;
      setConnection({ offline: true, reason });
    };

    const connect = () => {
      if (closed || offlineRef.current) {
        return;
      }
      source?.close();
      source = new EventSource("/api/project/events");

      source.onmessage = (message) => {
        try {
          const event = JSON.parse(message.data) as ProjectReloadEvent;
          if (event.type === "server_shutdown") {
            markOffline(event.reason);
            source?.close();
            source = null;
            return;
          }
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
        if (closed || offlineRef.current || reconnectTimer) {
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

  return connection;
}
