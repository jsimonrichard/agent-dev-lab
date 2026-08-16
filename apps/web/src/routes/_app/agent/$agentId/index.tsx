import { createFileRoute } from "@tanstack/react-router";

import { EmptySelectionPage } from "@/components/app/empty-selection";
import { NotFoundPage } from "@/components/app/not-found";
import { useAppLoaderData } from "@/hooks/use-app-loader-data";

export const Route = createFileRoute("/_app/agent/$agentId/")({
  component: AgentDetailPage,
});

function AgentDetailPage() {
  const { agentId } = Route.useParams();
  const { project } = useAppLoaderData();

  if (!project.agentIds.includes(agentId)) {
    return (
      <NotFoundPage
        inAppShell
        title="Unknown agent"
        description={`No agent named ${agentId} is registered in this project.`}
      />
    );
  }

  return <EmptySelectionPage message="No conversation selected" />;
}
