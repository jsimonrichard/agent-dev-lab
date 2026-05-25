import { createFileRoute, notFound } from "@tanstack/react-router";
import { getMockRun } from "@/lib/mock/data";
import { RunWorkspace } from "@/components/app/run-workspace";

export const Route = createFileRoute("/_app/workflows/$workflowId/run/$runId")({
  component: WorkflowRunPage,
  loader: ({ params }) => {
    const summary = getMockRun(params.runId);
    if (!summary || summary.workflowId !== params.workflowId) throw notFound();
    return { summary };
  },
});

function WorkflowRunPage() {
  const { summary } = Route.useLoaderData();
  return <RunWorkspace summary={summary} />;
}
