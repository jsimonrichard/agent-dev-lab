import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";

import { pauseWorkflowRun } from "#/lib/run-service.server";

export const Route = createFileRoute("/api/runs/$runId/debug/pause")({
  server: {
    handlers: {
      POST: async ({ params }) => {
        const result = await pauseWorkflowRun(params.runId);
        return json(result);
      },
    },
  },
});
