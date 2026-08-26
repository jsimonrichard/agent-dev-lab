import { ConfigWorkspace } from "@/components/app/config-workspace";
import { StartWorkflowForm } from "@/components/app/start-workflow-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { useAppLoaderData } from "@/hooks/use-app-loader-data";

export function WorkflowRegistryPage() {
  return <ConfigWorkspace title="Workflows" emptyMessage="No workflow selected" />;
}

export function WorkflowDefinitionPage({ workflowId }: { workflowId: string }) {
  const { project } = useAppLoaderData();
  const workflow = project.workflows.find((item) => item.id === workflowId);

  if (!workflow) {
    return null;
  }

  return (
    <ConfigWorkspace
      title={<span className="font-mono">{workflow.id}</span>}
      subtitle="No run selected. Start a run below or pick one from the sidebar."
    >
      <StartWorkflowCard workflowId={workflow.id} />
    </ConfigWorkspace>
  );
}

function StartWorkflowCard({ workflowId }: { workflowId?: string }) {
  const { project } = useAppLoaderData();

  return (
    <Card className="max-w-lg border-border/40">
      <CardContent>
        <StartWorkflowForm key={`${workflowId}:${project.generation}`} workflowId={workflowId} />
      </CardContent>
    </Card>
  );
}
