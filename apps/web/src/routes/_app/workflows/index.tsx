import { Link, createFileRoute } from "@tanstack/react-router";
import { InspectorSidebarTrigger } from "@/components/app/inspector-sidebar-trigger";
import { Separator } from "@/components/ui/separator";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAppLoaderData } from "@/hooks/use-app-loader-data";
import { startInspectionWorkflowRun } from "#/lib/inspector-server";

export const Route = createFileRoute("/_app/workflows/")({
  component: WorkflowsPage,
});

function WorkflowsPage() {
  const { project, runs } = useAppLoaderData();

  async function handleStart(workflowId: string) {
    const { runId } = await startInspectionWorkflowRun({ data: { workflowId, input: {} } });
    window.location.href = `/workflows/${workflowId}/run/${runId}`;
  }

  return (
    <div className="flex h-svh flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border/40 px-4">
        <InspectorSidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-6" />
        <h1 className="text-sm font-semibold">Workflows</h1>
      </header>
      <div className="grid flex-1 gap-4 overflow-auto p-6 sm:grid-cols-2">
        {project.workflowIds.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No workflows registered in <code className="text-xs">adl.config.ts</code>.
          </p>
        ) : (
          project.workflowIds.map((id) => {
            const latest = runs.find((r) => r.workflowId === id);
            return (
              <Card key={id}>
                <CardHeader>
                  <CardTitle className="font-mono text-base">{id}</CardTitle>
                  <CardDescription>
                    Registered workflow from the loaded ADL project.
                  </CardDescription>
                </CardHeader>
                <div className="flex flex-col gap-2 px-6 pb-6">
                  <Button size="sm" variant="secondary" onClick={() => void handleStart(id)}>
                    Start run
                  </Button>
                  {latest ? (
                    <Link
                      to="/workflows/$workflowId/run/$runId"
                      params={{ workflowId: id, runId: latest.runId }}
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      Open latest run →
                    </Link>
                  ) : null}
                </div>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
