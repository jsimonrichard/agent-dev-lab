import { Link, createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { GitBranch, Plus } from "lucide-react";

import { NotFoundPage } from "@/components/app/not-found";
import { InspectorSidebarTrigger } from "@/components/app/inspector-sidebar-trigger";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useAppLoaderData } from "@/hooks/use-app-loader-data";
import { createAgentSession } from "#/lib/inspector-server";

export const Route = createFileRoute("/_app/agent/$agentId/")({
  component: AgentSessionsPage,
  notFoundComponent: () => (
    <NotFoundPage
      inAppShell
      title="Agent not found"
      description="This agent is not registered in the loaded ADL project."
    />
  ),
});

function AgentSessionsPage() {
  const { agentId } = Route.useParams();
  const navigate = useNavigate();
  const { project, sessions } = useAppLoaderData();

  if (!project.agentIds.includes(agentId)) {
    throw notFound();
  }

  const agentSessions = sessions.filter((session) => session.agentId === agentId);

  async function handleNewConversation() {
    const { memoryScope } = await createAgentSession({ data: agentId });
    void navigate({
      to: "/agent/$agentId/r/$runId",
      params: { agentId, runId: memoryScope },
    });
  }

  return (
    <div className="flex h-svh min-h-0 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border/40 px-4">
        <InspectorSidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-6" />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">
            <Link to="/agent" className="hover:text-foreground hover:underline">
              Agents
            </Link>
            <span className="mx-1.5">/</span>
            <span className="font-mono text-foreground">{agentId}</span>
          </p>
          <h1 className="text-sm font-semibold">Conversations</h1>
        </div>
        <Button size="sm" onClick={() => void handleNewConversation()}>
          <Plus className="size-4" />
          New chat
        </Button>
      </header>

      <div className="flex-1 overflow-auto p-6">
        {agentSessions.length === 0 ? (
          <div className="mx-auto max-w-lg space-y-3 text-center">
            <p className="text-sm text-muted-foreground">
              No conversations yet for <code className="font-mono text-xs">{agentId}</code>.
            </p>
            <Button size="sm" variant="secondary" onClick={() => void handleNewConversation()}>
              Start first conversation
            </Button>
          </div>
        ) : (
          <ul className="mx-auto max-w-2xl divide-y divide-border/50 rounded-lg border border-border/40">
            {agentSessions.map((session) => (
              <li key={session.memoryScope}>
                <Link
                  to="/agent/$agentId/r/$runId"
                  params={{ agentId, runId: session.memoryScope }}
                  className="flex items-start justify-between gap-4 px-4 py-3 transition-colors hover:bg-muted/30"
                >
                  <div className="min-w-0">
                    <p className="line-clamp-2 text-sm font-medium">{session.title}</p>
                    <p className="truncate font-mono text-xs text-muted-foreground">
                      {session.memoryScope}
                    </p>
                  </div>
                  {session.fork ? (
                    <GitBranch className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
