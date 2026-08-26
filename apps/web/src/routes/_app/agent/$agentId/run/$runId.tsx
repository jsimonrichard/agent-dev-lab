import { createFileRoute, notFound } from "@tanstack/react-router";
import { ok } from "@agent-dev-lab/core/result";

import type { AgentInspectorMeta } from "#/lib/inspector-types";
import { AgentRunWorkspace } from "@/components/app/agent-run-workspace";
import { fetchAgentConversation } from "#/lib/inspector-server";
import { useAppLoaderData } from "@/hooks/use-app-loader-data";
import { parseAgentRunSearch } from "@/lib/agent-location";
import type { MockAgentSummary } from "@/lib/mock/types";

export const Route = createFileRoute("/_app/agent/$agentId/run/$runId")({
  component: AgentRunPage,
  gcTime: 0,
  validateSearch: parseAgentRunSearch,
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
  const { call } = Route.useSearch();
  const { project } = useAppLoaderData();
  const agentMeta = project.agents.find((item) => item.id === agent.id);
  const settings: AgentInspectorMeta = agentMeta ?? {
    id: conversation.agentId,
    model: null,
    memoryMode: "custom",
    tools: [],
    titleWorkflowId: null,
    outputSchema: null,
    systemPrompt: ok(""),
    systemPromptPath: null,
  };
  return (
    <AgentRunWorkspace
      key={conversation.runId}
      agent={agent}
      conversation={conversation}
      settings={settings}
      callId={call}
    />
  );
}
