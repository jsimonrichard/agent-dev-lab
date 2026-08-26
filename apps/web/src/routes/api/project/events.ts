import { createFileRoute } from "@tanstack/react-router";

import { getLoadedAdlProject } from "#/lib/adl-project.server";
import { encodeProjectReloadSse, subscribeProjectReload } from "#/lib/project-reload-events.server";
import type { ProjectReloadEvent } from "#/lib/project-reload-types";

export const Route = createFileRoute("/api/project/events")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const project = await getLoadedAdlProject();

        const stream = new ReadableStream({
          start(controller) {
            if (request.signal.aborted) {
              controller.close();
              return;
            }

            const encoder = new TextEncoder();
            let closed = false;
            let unsubscribe = () => {};

            const push = (event: ProjectReloadEvent) => {
              if (closed) {
                return;
              }
              try {
                controller.enqueue(encoder.encode(encodeProjectReloadSse(event)));
              } catch {
                closed = true;
                unsubscribe();
              }
            };

            unsubscribe = subscribeProjectReload(push);

            push({
              type: "snapshot",
              generation: project.generation,
              lastReloadError: project.lastReloadError,
            });

            const onAbort = () => {
              if (closed) {
                return;
              }
              closed = true;
              unsubscribe();
              try {
                controller.close();
              } catch {
                // already closed
              }
            };

            request.signal.addEventListener("abort", onAbort);
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        });
      },
    },
  },
});
