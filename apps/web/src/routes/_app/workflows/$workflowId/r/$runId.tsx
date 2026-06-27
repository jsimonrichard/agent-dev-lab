import { createFileRoute, notFound } from "@tanstack/react-router";

import { NotFoundPage } from "@/components/app/not-found";
import { RunWorkspace } from "@/components/app/run-workspace";
import { fetchWorkflowRun } from "#/lib/inspector-server";

export const Route = createFileRoute("/_app/workflows/$workflowId/r/$runId")({
  component: WorkflowRunPage,
  loader: async ({ params }) => {
    const data = await fetchWorkflowRun({ data: params.runId });
    if (!data || data.summary.workflowId !== params.workflowId) {
      throw notFound();
    }
    return data;
  },
  notFoundComponent: () => (
    <NotFoundPage
      inAppShell
      title="Run not found"
      description="This workflow run does not exist or does not belong to the requested workflow."
    />
  ),
});

function WorkflowRunPage() {
  const { summary, events } = Route.useLoaderData();
  return <RunWorkspace summary={summary} initialEvents={events} />;
}
