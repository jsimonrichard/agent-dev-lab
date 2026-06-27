import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";

import { listWorkflowRunSummaries, startWorkflowRun } from "#/lib/run-service";

export const Route = createFileRoute("/api/runs")({
  server: {
    handlers: {
      GET: async () => {
        const runs = await listWorkflowRunSummaries();
        return json({ runs });
      },
      POST: async ({ request }) => {
        const body = (await request.json()) as { workflowId?: string; input?: unknown };
        if (!body.workflowId) {
          return json({ error: "workflowId is required" }, { status: 400 });
        }
        const { runId } = await startWorkflowRun(body.workflowId, body.input ?? {});
        return json({ runId });
      },
    },
  },
});
