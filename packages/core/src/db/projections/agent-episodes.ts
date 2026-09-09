import { eq } from "drizzle-orm";

import type { AdlDb } from "../index";
import { agentEpisodes } from "../schema";

import type { RunEvent } from "../../observability/events";

/**
 * Projects agent episode lifecycle events into `adl_agent_episodes` — one row
 * per `agent.run()` call, replacing the scan-every-`agent_started`-event
 * approach `listAgentEpisodes` used before this table existed.
 *
 * `model_id`/`model_provider` are left untouched here: `agent_started` does
 * not yet carry the descriptor (Lane E adds it); once it does, this insert
 * picks it up with no further change to this file.
 */
export function projectAgentEpisode(db: AdlDb, event: RunEvent): void {
  if (event.type === "agent_started") {
    db.insert(agentEpisodes)
      .values({
        agentCallId: event.agentCallId,
        agentId: event.agentId,
        memoryScope: event.memoryScope,
        workflowRunId: event.workflowRunId ?? null,
        stepId: event.stepId ?? null,
        startedAt: event.at,
        finishedAt: null,
        status: "running",
      })
      .onConflictDoUpdate({
        target: agentEpisodes.agentCallId,
        set: {
          agentId: event.agentId,
          memoryScope: event.memoryScope,
          workflowRunId: event.workflowRunId ?? null,
          stepId: event.stepId ?? null,
          startedAt: event.at,
          finishedAt: null,
          status: "running",
        },
      })
      .run();
  }

  if (event.type === "agent_finished") {
    db.update(agentEpisodes)
      .set({ status: "ok", finishedAt: event.at })
      .where(eq(agentEpisodes.agentCallId, event.agentCallId))
      .run();
  }

  if (event.type === "agent_failed") {
    db.update(agentEpisodes)
      .set({ status: "error", finishedAt: event.at })
      .where(eq(agentEpisodes.agentCallId, event.agentCallId))
      .run();
  }
}
