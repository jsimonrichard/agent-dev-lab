import { createFileRoute } from "@tanstack/react-router";

import { getAdlRuntime } from "#/lib/adl-runtime.server";
import { getEventLog, tailLoggedEvents } from "#/lib/event-log/event-log.server";
import { onRequestOrServerShutdown, getServerShutdownSignal } from "#/lib/server-shutdown.server";
import { encodeLoggedRunEventSse } from "#/lib/sse.server";

const HEARTBEAT_MS = 15_000;

export const Route = createFileRoute("/api/events")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        await getAdlRuntime();
        const url = new URL(request.url);
        const afterSeq = Number(url.searchParams.get("afterSeq") ?? "0");
        const eventLog = getEventLog();
        const cursor = Number.isFinite(afterSeq) ? afterSeq : 0;
        let stopStream = () => {};

        const stream = new ReadableStream({
          start(controller) {
            if (request.signal.aborted) {
              return;
            }

            const encoder = new TextEncoder();
            const abort = new AbortController();
            let closed = false;

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
              if (!abort.signal.aborted) {
                abort.abort();
              }
              // End the HTTP body on process shutdown so srvx graceful close
              // is not blocked by this keep-alive stream. Skip on client cancel
              // (Vite proxies treat that close as a hang-up error).
              if (endResponse) {
                try {
                  controller.close();
                } catch {
                  // already closed
                }
              }
            };

            stopStream = () => stop(false);

            // First bytes flush the SSE response. An idle body looks like a hung
            // socket to Vite's proxy (`Internal server error: socket hang up`).
            enqueue(": connected\n\n");

            onRequestOrServerShutdown(request, () => {
              stop(getServerShutdownSignal().aborted);
            });

            void tailLoggedEvents(
              eventLog,
              cursor,
              (entry) => enqueue(encodeLoggedRunEventSse(entry)),
              abort.signal,
            ).finally(() => stop(false));
          },
          cancel() {
            // Client left (reload, HMR, navigating away). Do not controller.close() —
            // Vite logs that as "Internal server error: socket hang up".
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
