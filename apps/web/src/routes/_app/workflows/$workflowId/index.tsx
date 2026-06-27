import { Link, createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";

import { NotFoundPage } from "@/components/app/not-found";
import { InspectorSidebarTrigger } from "@/components/app/inspector-sidebar-trigger";
import { RunStatusBadge } from "@/components/app/run-status-badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useAppLoaderData } from "@/hooks/use-app-loader-data";
import { startInspectionWorkflowRun } from "#/lib/inspector-server";

export const Route = createFileRoute("/_app/workflows/$workflowId/")({
  component: WorkflowRunsPage,
  notFoundComponent: () => (
    <NotFoundPage
      inAppShell
      title="Workflow not found"
      description="This workflow is not registered in the loaded ADL project."
    />
  ),
});

function WorkflowRunsPage() {
  const { workflowId } = Route.useParams();
  const navigate = useNavigate();
  const { project, runs } = useAppLoaderData();

  if (!project.workflowIds.includes(workflowId)) {
    throw notFound();
  }

  const workflowRuns = runs.filter((run) => run.workflowId === workflowId);

  async function handleStartRun() {
    const { runId } = await startInspectionWorkflowRun({
      data: { workflowId, input: {} },
    });
    void navigate({
      to: "/workflows/$workflowId/r/$runId",
      params: { workflowId, runId },
    });
  }

  return (
    <div className="flex h-svh min-h-0 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border/40 px-4">
        <InspectorSidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-6" />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">
            <Link to="/workflows" className="hover:text-foreground hover:underline">
              Workflows
            </Link>
            <span className="mx-1.5">/</span>
            <span className="font-mono text-foreground">{workflowId}</span>
          </p>
          <h1 className="text-sm font-semibold">Runs</h1>
        </div>
        <Button size="sm" onClick={() => void handleStartRun()}>
          <Plus className="size-4" />
          Start run
        </Button>
      </header>

      <div className="flex-1 overflow-auto p-6">
        {workflowRuns.length === 0 ? (
          <div className="mx-auto max-w-lg space-y-3 text-center">
            <p className="text-sm text-muted-foreground">
              No runs yet for <code className="font-mono text-xs">{workflowId}</code>.
            </p>
            <Button size="sm" variant="secondary" onClick={() => void handleStartRun()}>
              Start first run
            </Button>
          </div>
        ) : (
          <ul className="mx-auto max-w-2xl divide-y divide-border/50 rounded-lg border border-border/40">
            {workflowRuns.map((run) => (
              <li key={run.runId}>
                <Link
                  to="/workflows/$workflowId/r/$runId"
                  params={{ workflowId, runId: run.runId }}
                  className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-muted/30"
                >
                  <div className="min-w-0">
                    <p className="truncate font-mono text-sm">{run.runId}</p>
                    <p className="truncate text-xs text-muted-foreground">{run.inputPreview}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                    <RunStatusBadge status={run.status} />
                    <span>{new Date(run.startedAt).toLocaleString()}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
