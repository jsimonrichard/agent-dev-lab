import { createFileRoute, notFound } from "@tanstack/react-router";
import { ok } from "@agent-dev-lab/core/result";

import { AgentRunWorkspace } from "@/components/app/agent-run-workspace";
import { fetchAgentConversation } from "#/lib/inspector-server";
import { agentSettingsFromMeta } from "@/components/app/agent-settings-panel";
import { useAppLoaderData } from "@/hooks/use-app-loader-data";
import type { MockAgentSummary } from "@/lib/mock/types";

export const Route = createFileRoute("/_app/agent/$agentId/run/$runId")({
  component: AgentRunPage,
  gcTime: 0,
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
  const settings = agentMeta
    ? agentSettingsFromMeta(agentMeta)
    : {
        agentId: conversation.agentId,
        model: null,
        memoryMode: "custom",
        tools: [],
        titleWorkflowId: null,
        systemPrompt: ok(""),
        systemPromptPath: null,
      };
  return (
    <AgentRunWorkspace
      key={conversation.runId}
      agent={agent}
      conversation={conversation}
      settings={settings}
    />
  );
}
