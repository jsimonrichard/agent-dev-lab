import { createFileRoute } from "@tanstack/react-router";

import { WorkflowRegistryPage } from "@/components/app/workflow-config-page";

export const Route = createFileRoute("/_app/workflows/")({
  component: WorkflowsPage,
});

function WorkflowsPage() {
  return <WorkflowRegistryPage />;
}
