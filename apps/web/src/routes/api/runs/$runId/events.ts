import { createFileRoute } from "@tanstack/react-router";

import { getWorkflowStore } from "#/lib/adl-runtime.server";
import { getServerShutdownSignal, onRequestOrServerShutdown } from "#/lib/server-shutdown.server";
import {
  encodeRunEventSse,
  encodeStreamErrorSse,
  shouldCloseWorkflowRunStream,
  workflowRunStreamIsTerminal,
} from "#/lib/sse.server";

// Node's default keepAliveTimeout is 5s. A comment interval longer than that
// lets the dev server drop an otherwise idle parked-run stream
// (`ERR_INCOMPLETE_CHUNKED_ENCODING` / Vite "socket hang up").
const HEARTBEAT_MS = 4_000;

export const Route = createFileRoute("/api/runs/$runId/events")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const url = new URL(request.url);
        const afterSeq = Number(url.searchParams.get("afterSeq") ?? "0");
        const store = await getWorkflowStore();
        const runId = params.runId;
        let stopStream = () => {};

        const stream = new ReadableStream({
          async start(controller) {
            if (request.signal.aborted) {
              return;
            }

            const encoder = new TextEncoder();
            let cursor = afterSeq;
            let closed = false;
            let pushing = false;
            const poll = { timer: undefined as ReturnType<typeof setInterval> | undefined };

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
              if (poll.timer) {
                clearInterval(poll.timer);
                poll.timer = undefined;
              }
              // End the HTTP body on a real terminal close so the client sees
              // EOF. Skip when the client already left — Vite's proxy logs
              // controller.close() on that path as "socket hang up".
              if (endResponse) {
                try {
                  controller.close();
                } catch {
                  // already closed
                }
              }
            };

            stopStream = () => stop(false);

            // First bytes flush the SSE response. A parked run has nothing
            // after the client's cursor, and an idle body looks like a hung
            // socket to Vite (`Internal server error: socket hang up`).
            enqueue(": connected\n\n");

            const push = async () => {
              if (closed || pushing) {
                return;
              }
              pushing = true;
              try {
                const events = await store.listEvents(
                  { workflowRunId: runId },
                  { afterSeq: cursor },
                );
                let sawTerminal = false;
                for (const event of events) {
                  cursor = event.runSeq;
                  if (!enqueue(encodeRunEventSse(event))) {
                    return;
                  }
                  if (workflowRunStreamIsTerminal(event)) {
                    sawTerminal = true;
                  }
                }
                if (sawTerminal) {
                  stop(true);
                  return;
                }
                if (events.length === 0) {
                  const run = await store.getRun(runId);
                  if (
                    shouldCloseWorkflowRunStream({
                      sawTerminalEvent: false,
                      eventBatchEmpty: true,
                      runStatus: run?.status,
                    })
                  ) {
                    stop(true);
                  }
                }
              } finally {
                pushing = false;
              }
            };

            const fail = (error: unknown) => {
              enqueue(encodeStreamErrorSse(error));
              stop(true);
            };

            try {
              await push();
            } catch (error) {
              fail(error);
              return;
            }
            if (closed) {
              return;
            }

            poll.timer = setInterval(() => {
              void push().catch(fail);
            }, 400);

            onRequestOrServerShutdown(request, () => {
              stop(getServerShutdownSignal().aborted);
            });
          },
          cancel() {
            // Client left (navigation / EventSource close). Do not
            // controller.close() — Vite logs that as a socket hang up.
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
