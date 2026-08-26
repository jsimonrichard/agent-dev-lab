import { createFileRoute } from "@tanstack/react-router";

import { AgentRegistryPage } from "@/components/app/agent-config-page";

export const Route = createFileRoute("/_app/agent/")({
  component: AgentIndexPage,
});

function AgentIndexPage() {
  return <AgentRegistryPage />;
}
