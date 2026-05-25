import { createFileRoute, notFound } from "@tanstack/react-router";
import { resolveAgentConversation } from "@/lib/mock/agent-conversations";
import { getMockAgent } from "@/lib/mock/data";
import { AgentRunWorkspace } from "@/components/app/agent-run-workspace";

export const Route = createFileRoute("/_app/agents/$conversationId")({
  component: AgentConversationPage,
  loader: ({ params }) => {
    const conversation = resolveAgentConversation(params.conversationId);
    if (!conversation) throw notFound();
    const agent = getMockAgent(conversation.agentId);
    if (!agent) throw notFound();
    return { agent, conversation };
  },
});

function AgentConversationPage() {
  const { agent, conversation } = Route.useLoaderData();
  return <AgentRunWorkspace agent={agent} conversation={conversation} />;
}
