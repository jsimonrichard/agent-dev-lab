import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";
import { isAdlError } from "@agent-dev-lab/core";

import { listWorkflowRunSummaries, startWorkflowRun } from "#/lib/run-service.server";

export const Route = createFileRoute("/api/runs")({
  server: {
    handlers: {
      GET: async () => {
        const runs = await listWorkflowRunSummaries();
        return json({ runs });
      },
      POST: async ({ request }) => {
        const body = (await request.json()) as {
          workflowId?: string;
          input?: unknown;
          title?: string;
        };
        if (!body.workflowId) {
          return json({ error: "workflowId is required" }, { status: 400 });
        }
        try {
          const { runId } = await startWorkflowRun(body.workflowId, body.input ?? {}, body.title);
          return json({ runId });
        } catch (error) {
          if (isAdlError(error) && error.code === "INVALID_INPUT") {
            return json({ error: error.message }, { status: 400 });
          }
          throw error;
        }
      },
    },
  },
});
