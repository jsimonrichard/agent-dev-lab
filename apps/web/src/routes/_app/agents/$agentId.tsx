import { createFileRoute, notFound } from "@tanstack/react-router";
import { getForkedSession } from "@/lib/mock/fork-sessions";
import { mockAgents } from "@/lib/mock/data";
import { AgentRunWorkspace } from "@/components/app/agent-run-workspace";

type AgentSearch = {
  fork?: string;
};

export const Route = createFileRoute("/_app/agents/$agentId")({
  validateSearch: (search: Record<string, unknown>): AgentSearch => ({
    fork: typeof search.fork === "string" ? search.fork : undefined,
  }),
  component: AgentRunPage,
  loader: ({ params }) => {
    const agent = mockAgents.find((a) => a.id === params.agentId);
    if (!agent) throw notFound();
    return { agent };
  },
});

function AgentRunPage() {
  const { agent } = Route.useLoaderData();
  const { fork } = Route.useSearch();
  const forkSession = fork ? (getForkedSession(fork) ?? null) : null;
  return <AgentRunWorkspace agent={agent} forkSession={forkSession} />;
}
