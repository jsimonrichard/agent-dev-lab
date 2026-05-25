import { createFileRoute, notFound } from "@tanstack/react-router";
import { resolveAgentConversation } from "@/lib/mock/agent-conversations";
import { getMockAgent, getMockAgentSettings } from "@/lib/mock/data";
import { AgentRunWorkspace } from "@/components/app/agent-run-workspace";

export const Route = createFileRoute("/_app/agent/$agentId/run/$runId")({
  component: AgentRunPage,
  loader: ({ params }) => {
    const conversation = resolveAgentConversation(params.runId);
    if (!conversation || conversation.agentId !== params.agentId) throw notFound();
    const agent = getMockAgent(conversation.agentId);
    if (!agent) throw notFound();
    const settings = getMockAgentSettings(conversation.agentId);
    if (!settings) throw notFound();
    return { agent, conversation, settings };
  },
});

function AgentRunPage() {
  const { agent, conversation, settings } = Route.useLoaderData();
  return <AgentRunWorkspace agent={agent} conversation={conversation} settings={settings} />;
}
