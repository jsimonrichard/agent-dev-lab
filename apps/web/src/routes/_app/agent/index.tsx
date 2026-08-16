import { createFileRoute } from "@tanstack/react-router";

import { EmptySelectionPage } from "@/components/app/empty-selection";

export const Route = createFileRoute("/_app/agent/")({
  component: AgentIndexPage,
});

function AgentIndexPage() {
  return <EmptySelectionPage message="No conversation selected" />;
}
