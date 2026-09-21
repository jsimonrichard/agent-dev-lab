import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";

import { retryWorkflowRun } from "#/lib/run-service.server";

export const Route = createFileRoute("/api/runs/$runId/retry")({
  server: {
    handlers: {
      POST: async ({ params, request }) => {
        const body = (await request.json()) as { stepId?: string };
        if (!body.stepId) {
          return json({ error: "stepId is required" }, { status: 400 });
        }
        try {
          const result = await retryWorkflowRun({
            runId: params.runId,
            stepId: body.stepId,
          });
          return json(result);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const status = /still running/i.test(message) ? 409 : 400;
          return json({ error: message }, { status });
        }
      },
    },
  },
});
