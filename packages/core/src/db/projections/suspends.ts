import { and, eq } from "drizzle-orm";

import type { AdlDb } from "../index";
import { suspends } from "../schema";

import type { RunEvent } from "../../observability/events";

/**
 * Projects suspend lifecycle events into `adl_suspends`.
 * Run status for the same events is updated in {@link projectWorkflowRun}.
 */
export function projectSuspend(db: AdlDb, event: RunEvent): void {
  if (event.type === "workflow_suspended") {
    db.insert(suspends)
      .values({
        handleId: event.handle.id,
        workflowRunId: event.handle.workflowRunId,
        intentId: event.handle.intentId,
        reason: event.handle.reason,
        createdAt: event.handle.createdAt,
        intentJson: JSON.stringify(event.intent),
        status: "pending",
        decisionJson: null,
        resolvedAt: null,
      })
      .onConflictDoUpdate({
        target: suspends.handleId,
        set: {
          workflowRunId: event.handle.workflowRunId,
          intentId: event.handle.intentId,
          reason: event.handle.reason,
          createdAt: event.handle.createdAt,
          intentJson: JSON.stringify(event.intent),
          status: "pending",
          decisionJson: null,
          resolvedAt: null,
        },
      })
      .run();
  }

  if (event.type === "workflow_resumed") {
    db.update(suspends)
      .set({
        status: "resolved",
        decisionJson: JSON.stringify(event.decision),
        resolvedAt: event.at,
      })
      .where(and(eq(suspends.handleId, event.handleId), eq(suspends.status, "pending")))
      .run();
  }
}
