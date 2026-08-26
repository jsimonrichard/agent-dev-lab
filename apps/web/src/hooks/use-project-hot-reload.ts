import { useEffect, useRef } from "react";
import { useRouter } from "@tanstack/react-router";

import type { ProjectReloadEvent } from "#/lib/project-reload-types";

/** Invalidate app loaders when the ADL project registry hot-reloads. */
export function useProjectHotReload(): void {
  const router = useRouter();
  const snapshotRef = useRef<{ generation: number; lastReloadError: string | null } | null>(null);

  useEffect(() => {
    const source = new EventSource("/api/project/events");

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

    return () => {
      source.close();
    };
  }, [router]);
}
