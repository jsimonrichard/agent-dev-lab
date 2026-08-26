import { createFileRoute } from "@tanstack/react-router";

import { WorkflowDefinitionPage } from "@/components/app/workflow-config-page";
import { NotFoundPage } from "@/components/app/not-found";
import { useAppLoaderData } from "@/hooks/use-app-loader-data";

export const Route = createFileRoute("/_app/workflows/$workflowId/")({
  component: WorkflowDetailPage,
});

function WorkflowDetailPage() {
  const { workflowId } = Route.useParams();
  const { project } = useAppLoaderData();

  if (!project.workflowIds.includes(workflowId)) {
    return (
      <NotFoundPage
        inAppShell
        title="Unknown workflow"
        description={`No workflow named ${workflowId} is registered in this project.`}
      />
    );
  }

  return <WorkflowDefinitionPage workflowId={workflowId} />;
}
