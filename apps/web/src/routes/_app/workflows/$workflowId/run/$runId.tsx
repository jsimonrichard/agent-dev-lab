import { createFileRoute, notFound } from "@tanstack/react-router";
import type { ErrorComponentProps } from "@tanstack/react-router";

import { RunWorkspace } from "@/components/app/run-workspace";
import { RunWorkspaceError } from "@/components/app/run-workspace-error";
import { RunWorkspacePending } from "@/components/app/run-workspace-pending";
import { fetchMessagesForWorkflowRun, fetchWorkflowRun } from "#/lib/inspector-server";
import { parseWorkflowRunSearch } from "@/lib/workflow-location";

export const Route = createFileRoute("/_app/workflows/$workflowId/run/$runId")({
  pendingMs: 150,
  pendingComponent: RunWorkspacePending,
  errorComponent: WorkflowRunError,
  validateSearch: parseWorkflowRunSearch,
  loader: async ({ params }) => {
    const messagesPromise = fetchMessagesForWorkflowRun({ data: params.runId });
    const data = await fetchWorkflowRun({ data: params.runId });
    if (!data || data.summary.workflowId !== params.workflowId) {
      throw notFound();
    }
    return { ...data, messagesPromise };
  },
  component: WorkflowRunPage,
});

function WorkflowRunError({ error }: ErrorComponentProps) {
  const { workflowId } = Route.useParams();
  return <RunWorkspaceError error={error} workflowId={workflowId} />;
}

function WorkflowRunPage() {
  const { summary, events, messagesPromise } = Route.useLoaderData();
  const search = Route.useSearch();
  return (
    <RunWorkspace
      summary={summary}
      initialEvents={events}
      messagesPromise={messagesPromise}
      initialStepId={search.step}
      initialEpisodeId={search.episode}
    />
  );
}
