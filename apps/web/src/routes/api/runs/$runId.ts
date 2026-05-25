import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";

import { getWorkflowRunSummary, getWorkflowRunUiEvents } from "#/lib/run-service";

export const Route = createFileRoute("/api/runs/$runId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const summary = await getWorkflowRunSummary(params.runId);
        if (!summary) {
          return json({ error: "Run not found" }, { status: 404 });
        }
        const events = await getWorkflowRunUiEvents(params.runId);
        return json({ summary, events });
      },
    },
  },
});
