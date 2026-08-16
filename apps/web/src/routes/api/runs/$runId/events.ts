import { createFileRoute } from "@tanstack/react-router";

import { getWorkflowStore } from "#/lib/adl-runtime.server";
import { encodeRunEventSse, workflowRunStreamIsTerminal } from "#/lib/sse.server";

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

            const push = async () => {
              if (closed) {
                return;
              }
              const events = await store.listEvents({ workflowRunId: runId }, { afterSeq: cursor });
              for (const event of events) {
                cursor = event.seq;
                controller.enqueue(encoder.encode(encodeRunEventSse(event)));
                if (workflowRunStreamIsTerminal(event)) {
                  closed = true;
                  controller.close();
                  return;
                }
              }
              const run = await store.getRun(runId);
              if (run && run.status !== "running") {
                closed = true;
                controller.close();
                return;
              }
            };

            await push();
            if (closed) {
              return;
            }

            const interval = setInterval(() => {
              void push().catch(() => {
                clearInterval(interval);
                controller.close();
              });
            }, 400);

            request.signal.addEventListener("abort", () => {
              clearInterval(interval);
              closed = true;
              controller.close();
            });
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
