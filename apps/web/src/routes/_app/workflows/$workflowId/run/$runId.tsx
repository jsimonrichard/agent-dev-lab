import { createFileRoute, notFound } from "@tanstack/react-router";
import type { ErrorComponentProps } from "@tanstack/react-router";

import { RunWorkspace } from "@/components/app/run-workspace";
import { RunWorkspaceError } from "@/components/app/run-workspace-error";
import { RunWorkspacePending } from "@/components/app/run-workspace-pending";
import {
  fetchChildWorkflowRuns,
  fetchMessagesForWorkflowRun,
  fetchWorkflowRun,
} from "#/lib/inspector/inspector-server";
import { parseWorkflowRunSearch } from "@/lib/workflow/workflow-location";

export const Route = createFileRoute("/_app/workflows/$workflowId/run/$runId")({
  gcTime: 0,
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
    const parentId = data.summary.parentWorkflowRunId;
    const [parentSummary, childRuns] = await Promise.all([
      parentId
        ? fetchWorkflowRun({ data: parentId }).then((parent) => parent?.summary ?? null)
        : Promise.resolve(null),
      fetchChildWorkflowRuns({ data: params.runId }),
    ]);
    return { ...data, messagesPromise, parentSummary, childRuns };
  },
  component: WorkflowRunPage,
});

function WorkflowRunError({ error }: ErrorComponentProps) {
  const { workflowId } = Route.useParams();
  return <RunWorkspaceError error={error} workflowId={workflowId} />;
}

function WorkflowRunPage() {
  const { summary, events, messagesPromise, parentSummary, childRuns } = Route.useLoaderData();
  return (
    <RunWorkspace
      key={summary.runId}
      summary={summary}
      initialEvents={events}
      messagesPromise={messagesPromise}
      parentSummary={parentSummary}
      childRuns={childRuns}
    />
  );
}
