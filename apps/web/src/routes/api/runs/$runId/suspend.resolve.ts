import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";

import { continueWorkflowDebug } from "#/lib/run-service.server";

export const Route = createFileRoute("/api/runs/$runId/suspend/resolve")({
  server: {
    handlers: {
      POST: async ({ params, request }) => {
        const body = (await request.json()) as { mode?: string };
        if (body.mode !== "continue" && body.mode !== "step") {
          return json({ error: "mode must be continue or step" }, { status: 400 });
        }
        try {
          const result = await continueWorkflowDebug({
            runId: params.runId,
            mode: body.mode,
          });
          return json(result);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return json({ error: message }, { status: 400 });
        }
      },
    },
  },
});
