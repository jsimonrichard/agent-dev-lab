import { createFileRoute } from "@tanstack/react-router";

import { getAgentSessionByMemoryScope, isConversationTurnActive } from "#/lib/agent-sessions";
import { getWorkflowStore } from "#/lib/adl-runtime.server";
import {
  encodeRunEventSse,
  agentRunStreamIsTerminal,
  shouldCloseAgentConversationStream,
} from "#/lib/sse.server";

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
        let agentCallId = session.agentCallId;
        const store = await getWorkflowStore();

        const stream = new ReadableStream({
          async start(controller) {
            const encoder = new TextEncoder();
            let cursor = afterSeq;
            let sawTerminal = false;
            let closed = false;
            const poll = { timer: undefined as ReturnType<typeof setInterval> | undefined };

            const stopPolling = () => {
              if (poll.timer) {
                clearInterval(poll.timer);
                poll.timer = undefined;
              }
            };

            const push = async () => {
              if (closed) {
                return;
              }
              const live = getAgentSessionByMemoryScope(params.memoryScope);
              const liveId = live?.agentCallId;
              if (!liveId || liveId.startsWith("pending:")) {
                return;
              }
              if (liveId !== agentCallId) {
                agentCallId = liveId;
                cursor = 0;
                sawTerminal = false;
              }
              const events = await store.listEvents({ agentCallId }, { afterSeq: cursor });
              for (const event of events) {
                cursor = event.seq;
                controller.enqueue(encoder.encode(encodeRunEventSse(event)));
                if (agentRunStreamIsTerminal(event)) {
                  sawTerminal = true;
                }
              }
              if (
                shouldCloseAgentConversationStream({
                  sawTerminalEvent: sawTerminal,
                  conversationTurnActive: isConversationTurnActive(params.memoryScope),
                })
              ) {
                closed = true;
                stopPolling();
                controller.close();
              }
            };

            await push();
            if (closed) {
              return;
            }

            poll.timer = setInterval(() => {
              void push().catch(() => {
                stopPolling();
                closed = true;
                controller.close();
              });
            }, 400);

            request.signal.addEventListener("abort", () => {
              stopPolling();
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
