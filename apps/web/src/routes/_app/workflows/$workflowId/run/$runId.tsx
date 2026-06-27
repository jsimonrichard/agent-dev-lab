import { createFileRoute, notFound } from "@tanstack/react-router";

import { RunWorkspace } from "@/components/app/run-workspace";
import { fetchWorkflowRun } from "#/lib/inspector-server";

export const Route = createFileRoute("/_app/workflows/$workflowId/run/$runId")({
  component: WorkflowRunPage,
  loader: async ({ params }) => {
    const data = await fetchWorkflowRun({ data: params.runId });
    if (!data || data.summary.workflowId !== params.workflowId) {
      throw notFound();
    }
    return data;
  },
});

function WorkflowRunPage() {
  const { summary, events } = Route.useLoaderData();
  return <RunWorkspace summary={summary} initialEvents={events} />;
}
