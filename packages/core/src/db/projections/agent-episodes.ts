import { eq } from "drizzle-orm";

import type { AdlDb } from "../index";
import { agentEpisodes } from "../schema";

import type { RunEvent } from "../../observability/events";
import type { TokenUsage } from "../../observability/token-usage";

/**
 * Projects agent episode lifecycle events into `adl_agent_episodes` — one row
 * per `agent.run()` call, replacing the scan-every-`agent_started`-event
 * approach `listAgentEpisodes` used before this table existed.
 *
 * `model_id`/`model_provider` are left untouched here: `agent_started` does
 * not yet carry the descriptor (Lane E adds it); once it does, this insert
 * picks it up with no further change to this file.
 *
 * `tool_provider_context_json` is the raw `toolProviderContext` from
 * `agent_started` (JSON), or null when the caller omitted it.
 *
 * Token columns are written from `agent_finished.usage` only — omitted fields
 * stay null rather than becoming zeros.
 */
export function projectAgentEpisode(db: AdlDb, event: RunEvent): void {
  if (event.type === "agent_started") {
    const toolProviderContextJson =
      event.toolProviderContext !== undefined ? JSON.stringify(event.toolProviderContext) : null;
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
        toolProviderContextJson,
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
          toolProviderContextJson,
        },
      })
      .run();
  }

  if (event.type === "agent_finished") {
    db.update(agentEpisodes)
      .set({
        status: "ok",
        finishedAt: event.at,
        ...tokenColumnsFromUsage(event.usage),
      })
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

function tokenColumnsFromUsage(usage: TokenUsage | undefined): {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  cachedInputTokens: number | null;
  reasoningTokens: number | null;
} {
  return {
    inputTokens: usage?.inputTokens ?? null,
    outputTokens: usage?.outputTokens ?? null,
    totalTokens: usage?.totalTokens ?? null,
    cachedInputTokens: usage?.cachedInputTokens ?? null,
    reasoningTokens: usage?.reasoningTokens ?? null,
  };
}
