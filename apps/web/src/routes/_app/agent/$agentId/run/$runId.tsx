import { createFileRoute, notFound } from "@tanstack/react-router";

import { AgentRunWorkspace } from "@/components/app/agent-run-workspace";
import { fetchAgentConversation } from "#/lib/inspector-server";
import { useAppLoaderData } from "@/hooks/use-app-loader-data";
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
    return { agent, conversation };
  },
});

function AgentRunPage() {
  const { agent, conversation } = Route.useLoaderData();
  const { project } = useAppLoaderData();
  const agentMeta = project.agents.find((item) => item.id === agent.id);
  const settings: MockAgentSettings = {
    agentId: conversation.agentId,
    model: agentMeta?.model ?? null,
    memoryMode: agentMeta?.memoryMode ?? "custom",
    tools: agentMeta?.tools ?? [],
  };
  return (
    <AgentRunWorkspace
      agent={agent}
      conversation={conversation}
      settings={settings}
    />
  );
}
