import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";

import { resolveWorkflowSuspend } from "#/lib/run-service.server";

export const Route = createFileRoute("/api/runs/$runId/suspend")({
  server: {
    handlers: {
      POST: async ({ params, request }) => {
        const body = (await request.json()) as {
          handleId?: string;
          decision?: { action: "allow" } | { action: "deny"; reason: string };
        };
        if (!body.handleId) {
          return json({ error: "handleId is required" }, { status: 400 });
        }
        if (
          !body.decision ||
          (body.decision.action !== "allow" && body.decision.action !== "deny")
        ) {
          return json({ error: "decision.action must be allow or deny" }, { status: 400 });
        }
        if (body.decision.action === "deny" && !body.decision.reason) {
          return json({ error: "deny requires a reason" }, { status: 400 });
        }
        try {
          const result = await resolveWorkflowSuspend({
            runId: params.runId,
            handleId: body.handleId,
            decision: body.decision,
          });
          return json(result);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const status = /not found|does not belong/i.test(message) ? 404 : 400;
          return json({ error: message }, { status });
        }
      },
    },
  },
});
