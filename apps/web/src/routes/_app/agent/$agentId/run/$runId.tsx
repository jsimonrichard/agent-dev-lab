import { createFileRoute, notFound } from "@tanstack/react-router";

import { AgentRunWorkspace } from "@/components/app/agent-run-workspace";
import { fetchAgentConversation } from "#/lib/inspector-server";
import type { MockAgentSettings, MockAgentSummary } from "@/lib/mock/types";

export const Route = createFileRoute("/_app/agent/$agentId/run/$runId")({
  component: AgentRunPage,
  loader: async ({ params }) => {
    const conversation = await fetchAgentConversation({ data: params.runId });
    if (!conversation || conversation.agentId !== params.agentId) {
      throw notFound();
    }
    const agent: MockAgentSummary = {
      id: conversation.agentId,
      description: `Agent ${conversation.agentId} from project registry`,
    };
    const settings: MockAgentSettings = {
      agentId: conversation.agentId,
      model: "configured in project",
      temperature: 0,
      maxSteps: 0,
      memoryMode: conversation.runId,
      tools: [],
    };
    return { agent, conversation, settings };
  },
});

function AgentRunPage() {
  const { agent, conversation, settings } = Route.useLoaderData();
  return <AgentRunWorkspace agent={agent} conversation={conversation} settings={settings} />;
}
