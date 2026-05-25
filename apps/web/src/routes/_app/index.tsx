import { createFileRoute, redirect } from "@tanstack/react-router";
import { mockRuns } from "@/lib/mock/data";

export const Route = createFileRoute("/_app/")({
  beforeLoad: () => {
    const first = mockRuns[0];
    if (first) {
      throw redirect({ to: "/runs/$runId", params: { runId: first.runId } });
    }
  },
  component: () => null,
});
