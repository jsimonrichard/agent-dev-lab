import { createFileRoute, useNavigate, useRouteContext } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/_app/agent/")({
  component: AgentIndexPage,
});

function AgentIndexPage() {
  const navigate = useNavigate();
  const { sessions } = useRouteContext({ from: "/_app" });

  useEffect(() => {
    const first = sessions[0];
    if (first) {
      void navigate({
        to: "/agent/$agentId/run/$runId",
        params: { agentId: first.agentId, runId: first.memoryScope },
        replace: true,
      });
    }
  }, [sessions, navigate]);

  return (
    <p className="p-6 text-sm text-muted-foreground">
      No agent sessions yet. Register agents in the project or fork from a workflow step.
    </p>
  );
}
