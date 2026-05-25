import { createFileRoute, redirect } from "@tanstack/react-router";
import { getDefaultAgentRun } from "@/lib/mock/agent-conversations";

export const Route = createFileRoute("/_app/agent/")({
  beforeLoad: () => {
    const first = getDefaultAgentRun();
    if (first) {
      throw redirect({
        to: "/agent/$agentId/run/$runId",
        params: { agentId: first.agentId, runId: first.runId },
      });
    }
  },
  component: () => null,
});
