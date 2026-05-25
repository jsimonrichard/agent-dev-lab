import { createFileRoute, redirect } from "@tanstack/react-router";
import { getDefaultAgentConversationId } from "@/lib/mock/agent-conversations";

export const Route = createFileRoute("/_app/agents/")({
  beforeLoad: () => {
    const first = getDefaultAgentConversationId();
    if (first) {
      throw redirect({ to: "/agents/$conversationId", params: { conversationId: first } });
    }
  },
  component: () => null,
});
