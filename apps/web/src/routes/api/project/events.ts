import { createFileRoute } from "@tanstack/react-router";

import { getLoadedAdlProject } from "#/lib/adl-project.server";
import { encodeProjectReloadSse, subscribeProjectReload } from "#/lib/project-reload-events.server";
import type { ProjectReloadEvent } from "#/lib/project-reload-types";
import { onRequestOrServerShutdown, getServerShutdownSignal } from "#/lib/server-shutdown.server";

const HEARTBEAT_MS = 15_000;

export const Route = createFileRoute("/api/project/events")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const project = await getLoadedAdlProject();
        let stopStream = () => {};

        const stream = new ReadableStream({
          start(controller) {
            if (request.signal.aborted) {
              return;
            }

            const encoder = new TextEncoder();
            let closed = false;
            let unsubscribe = () => {};

            const enqueue = (chunk: string) => {
              if (closed) {
                return false;
              }
              try {
                controller.enqueue(encoder.encode(chunk));
                return true;
              } catch {
                stop(false);
                return false;
              }
            };

            const heartbeat = setInterval(() => {
              enqueue(": ping\n\n");
            }, HEARTBEAT_MS);

            const stop = (endResponse: boolean) => {
              if (closed) {
                return;
              }
              closed = true;
              clearInterval(heartbeat);
              unsubscribe();
              if (endResponse) {
                try {
                  controller.close();
                } catch {
                  // already closed
                }
              }
            };

            stopStream = () => stop(false);

            // Flush immediately so Vite's proxy does not treat an idle SSE body
            // as a hung socket.
            enqueue(": connected\n\n");

            unsubscribe = subscribeProjectReload((event: ProjectReloadEvent) => {
              enqueue(encodeProjectReloadSse(event));
            });

            enqueue(
              encodeProjectReloadSse({
                type: "snapshot",
                generation: project.generation,
                lastReloadError: project.lastReloadError,
              }),
            );

            onRequestOrServerShutdown(request, () => {
              stop(getServerShutdownSignal().aborted);
            });
          },
          cancel() {
            // Client left (reload / HMR). Avoid controller.close() — Vite logs
            // that as "Internal server error: socket hang up".
            stopStream();
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
          },
        });
      },
    },
  },
});
