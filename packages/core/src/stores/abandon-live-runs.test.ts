import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "bun:test";

import { EVENT_SCHEMA_VERSION } from "../observability/events";
import { LIVE_RUN_CLOSED_DENY } from "../effect/types";
import { abandonLiveRunsLostOnRestart, PROCESS_RESTART_RUN_GONE } from "./abandon-live-runs";
import { inMemoryWorkflowStore } from "./in-memory-workflow-store";
import { sqliteWorkflowStore } from "./sqlite-workflow-store";
import type { WorkflowStore } from "./workflow-store";

async function uniqueDbPath(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "adl-abandon-"));
  return path.join(dir, "test.sqlite");
}

async function startLiveRun(
  store: WorkflowStore,
  args: { workflowRunId: string; suspend?: boolean; episode?: boolean },
): Promise<void> {
  await store.recordEvent({
    type: "workflow_started",
    workflowRunId: args.workflowRunId,
    workflowId: "abandon-demo",
    input: {},
    runSeq: 1,
    at: "2026-01-01T00:00:00.000Z",
    eventSchemaVersion: EVENT_SCHEMA_VERSION,
  });
  if (args.suspend) {
    const suspend = {
      handle: {
        id: `h-${args.workflowRunId}`,
        intentId: `i-${args.workflowRunId}`,
        workflowRunId: args.workflowRunId,
        reason: "approval",
        createdAt: "2026-01-01T00:00:01.000Z",
      },
      intent: {
        id: `i-${args.workflowRunId}`,
        kind: "approval",
        reversibility: "irreversible",
        workflowRunId: args.workflowRunId,
        payload: {},
      },
    } as const;
    await store.createSuspend(suspend);
    await store.recordEvent({
      type: "workflow_suspended",
      workflowRunId: args.workflowRunId,
      ...suspend,
      runSeq: 2,
      at: "2026-01-01T00:00:01.000Z",
      eventSchemaVersion: EVENT_SCHEMA_VERSION,
    });
  }
  if (args.episode) {
    await store.recordEvent({
      type: "agent_started",
      agentCallId: `ep-${args.workflowRunId}`,
      agentId: "coder",
      memoryScope: `conv:${args.workflowRunId}`,
      workflowRunId: args.workflowRunId,
      runSeq: args.suspend ? 3 : 2,
      at: "2026-01-01T00:00:02.000Z",
      eventSchemaVersion: EVENT_SCHEMA_VERSION,
    });
  }
}

describe("abandonLiveRunsLostOnRestart", () => {
  it("fails live runs and episodes; leaves finished runs", async () => {
    const store = inMemoryWorkflowStore();
    await startLiveRun(store, { workflowRunId: "live", suspend: true, episode: true });
    await store.recordEvent({
      type: "workflow_started",
      workflowRunId: "done",
      workflowId: "abandon-demo",
      input: {},
      runSeq: 1,
      at: "2026-01-01T00:00:00.000Z",
      eventSchemaVersion: EVENT_SCHEMA_VERSION,
    });
    await store.recordEvent({
      type: "workflow_finished",
      workflowRunId: "done",
      output: { ok: true },
      runSeq: 2,
      at: "2026-01-01T00:00:03.000Z",
      eventSchemaVersion: EVENT_SCHEMA_VERSION,
    });

    const abandoned = await abandonLiveRunsLostOnRestart(store);
    expect(abandoned.workflowRunIds).toEqual(["live"]);
    expect(abandoned.agentCallIds).toEqual(["ep-live"]);
    expect((await store.getRun("live"))?.status).toBe("error");
    expect((await store.getRun("done"))?.status).toBe("ok");
    expect(await store.listPendingSuspends({ workflowRunId: "live" })).toEqual([]);
    const episode = (await store.listAgentEpisodes()).find((row) => row.agentCallId === "ep-live");
    expect(episode?.status).toBe("error");
    const failed = await store.getLatestEvent({ workflowRunId: "live" }, "workflow_failed");
    expect((failed?.error as { message?: string } | undefined)?.message).toContain(
      PROCESS_RESTART_RUN_GONE,
    );
  });

  it("closes a persisted suspend when a new process opens the same sqlite file", async () => {
    const dbPath = await uniqueDbPath();
    const first = sqliteWorkflowStore({ path: dbPath });
    await startLiveRun(first, { workflowRunId: "parked", suspend: true });
    expect((await first.getRun("parked"))?.status).toBe("suspended");

    const reopened = sqliteWorkflowStore({ path: dbPath });
    expect((await reopened.getRun("parked"))?.status).toBe("suspended");
    const waited = reopened.waitForSuspendResolution("h-parked");
    const abandoned = await abandonLiveRunsLostOnRestart(reopened);
    expect(abandoned.workflowRunIds).toEqual(["parked"]);
    await expect(waited).resolves.toEqual(LIVE_RUN_CLOSED_DENY);
    expect((await reopened.getRun("parked"))?.status).toBe("error");
    expect(await reopened.listPendingSuspends({ workflowRunId: "parked" })).toEqual([]);
  });
});
