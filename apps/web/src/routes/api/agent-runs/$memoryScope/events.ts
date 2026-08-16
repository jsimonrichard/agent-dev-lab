import { createFileRoute } from "@tanstack/react-router";

import { getAgentSessionByMemoryScope } from "#/lib/agent-sessions";
import { getWorkflowStore } from "#/lib/adl-runtime.server";
import { encodeRunEventSse, agentRunStreamIsTerminal } from "#/lib/sse.server";

export const Route = createFileRoute("/api/agent-runs/$memoryScope/events")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const session = getAgentSessionByMemoryScope(params.memoryScope);
        if (!session || session.agentCallId.startsWith("pending:")) {
          return new Response("Session not ready", { status: 404 });
        }

        const url = new URL(request.url);
        const afterSeq = Number(url.searchParams.get("afterSeq") ?? "0");
        const agentCallId = session.agentCallId;
        const store = await getWorkflowStore();

        const stream = new ReadableStream({
          async start(controller) {
            const encoder = new TextEncoder();
            let cursor = afterSeq;
            let closed = false;

            const push = async () => {
              if (closed) {
                return;
              }
              const events = await store.listEvents({ agentCallId }, { afterSeq: cursor });
              for (const event of events) {
                cursor = event.seq;
                controller.enqueue(encoder.encode(encodeRunEventSse(event)));
                if (agentRunStreamIsTerminal(event)) {
                  closed = true;
                  controller.close();
                  return;
                }
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
