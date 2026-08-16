import { createFileRoute } from "@tanstack/react-router";

import { EmptySelectionPage } from "@/components/app/empty-selection";

export const Route = createFileRoute("/_app/workflows/")({
  component: WorkflowsPage,
});

function WorkflowsPage() {
  return <EmptySelectionPage message="No workflow run selected" />;
}
