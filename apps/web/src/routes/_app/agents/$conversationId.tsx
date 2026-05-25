import { createFileRoute, notFound } from "@tanstack/react-router";
import { resolveAgentConversation } from "@/lib/mock/agent-conversations";
import { getMockAgent, getMockAgentSettings } from "@/lib/mock/data";
import { AgentRunWorkspace } from "@/components/app/agent-run-workspace";

export const Route = createFileRoute("/_app/agents/$conversationId")({
  component: AgentConversationPage,
  loader: ({ params }) => {
    const conversation = resolveAgentConversation(params.conversationId);
    if (!conversation) throw notFound();
    const agent = getMockAgent(conversation.agentId);
    if (!agent) throw notFound();
    const settings = getMockAgentSettings(conversation.agentId);
    if (!settings) throw notFound();
    return { agent, conversation, settings };
  },
});

function AgentConversationPage() {
  const { agent, conversation, settings } = Route.useLoaderData();
  return <AgentRunWorkspace agent={agent} conversation={conversation} settings={settings} />;
}
