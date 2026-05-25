import { createFileRoute, redirect } from "@tanstack/react-router";
import { mockRuns } from "@/lib/mock/data";

export const Route = createFileRoute("/_app/")({
  beforeLoad: () => {
    const first = mockRuns[0];
    if (first) {
      throw redirect({
        to: "/workflows/$workflowId/run/$runId",
        params: { workflowId: first.workflowId, runId: first.runId },
      });
    }
  },
  component: () => null,
});
