import { createFileRoute } from "@tanstack/react-router";

import { getWorkflowStore } from "#/lib/adl-runtime.server";
import {
  encodeRunEventSse,
  shouldCloseWorkflowRunStream,
  workflowRunStreamIsTerminal,
} from "#/lib/sse.server";

export const Route = createFileRoute("/api/runs/$runId/events")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const url = new URL(request.url);
        const afterSeq = Number(url.searchParams.get("afterSeq") ?? "0");
        const store = await getWorkflowStore();
        const runId = params.runId;

        const stream = new ReadableStream({
          async start(controller) {
            const encoder = new TextEncoder();
            let cursor = afterSeq;
            let closed = false;
            let pushing = false;
            const poll = { timer: undefined as ReturnType<typeof setInterval> | undefined };

            const close = () => {
              if (closed) {
                return;
              }
              closed = true;
              if (poll.timer) {
                clearInterval(poll.timer);
                poll.timer = undefined;
              }
              try {
                controller.close();
              } catch {
                // already closed
              }
            };

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
                  cursor = event.seq;
                  controller.enqueue(encoder.encode(encodeRunEventSse(event)));
                  if (workflowRunStreamIsTerminal(event)) {
                    sawTerminal = true;
                  }
                }
                if (sawTerminal) {
                  close();
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
                    close();
                  }
                }
              } finally {
                pushing = false;
              }
            };

            await push();
            if (closed) {
              return;
            }

            poll.timer = setInterval(() => {
              void push().catch(() => {
                close();
              });
            }, 400);

            request.signal.addEventListener("abort", close);
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
