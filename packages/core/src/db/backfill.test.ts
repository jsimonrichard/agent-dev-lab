import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";

import { backfillKeys } from "./backfill";
import { ensureAdlSchema } from "./ensure-schema";

/**
 * A database as it existed before this lane: the log under its old name with a
 * `seq` column, the UI-owned conversation table under its old name with
 * agent_call_id NOT NULL, and no episode or conversation-metadata projections.
 * Everything here has to survive, and the two new tables have to be rebuilt
 * from the retained events alone.
 */
function createPreMigrationDatabase(): Database {
  const sqlite = new Database(":memory:");
  sqlite.exec(`
    CREATE TABLE adl_workflow_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workflow_run_id TEXT,
      agent_call_id TEXT,
      seq INTEGER NOT NULL,
      type TEXT NOT NULL,
      at TEXT NOT NULL,
      event_schema_version INTEGER NOT NULL DEFAULT 1,
      payload_json TEXT NOT NULL
    )
  `);
  sqlite.exec(
    `CREATE INDEX adl_workflow_events_run_seq ON adl_workflow_events (workflow_run_id, seq)`,
  );
  sqlite.exec(`
    CREATE TABLE adl_inspector_sessions (
      memory_scope TEXT PRIMARY KEY NOT NULL,
      agent_id TEXT NOT NULL,
      agent_call_id TEXT NOT NULL,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      fork_json TEXT
    )
  `);
  sqlite.exec(`
    CREATE TABLE adl_messages (
      memory_scope TEXT PRIMARY KEY NOT NULL,
      messages_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  const insertEvent = sqlite.prepare(
    `INSERT INTO adl_workflow_events
      (workflow_run_id, agent_call_id, seq, type, at, event_schema_version, payload_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const event = (payload: Record<string, unknown>) => {
    insertEvent.run(
      (payload.workflowRunId as string | undefined) ?? null,
      (payload.agentCallId as string | undefined) ?? null,
      payload.runSeq as number,
      payload.type as string,
      payload.at as string,
      1,
      JSON.stringify(payload),
    );
  };

  // Episode 1: ran to completion, inside a workflow.
  event({
    type: "agent_started",
    agentCallId: "call-1",
    agentId: "researcher",
    memoryScope: "conv:1",
    workflowRunId: "run-1",
    stepId: "step-1",
    runSeq: 1,
    at: "2026-01-01T00:00:00.000Z",
  });
  event({
    type: "agent_finished",
    agentCallId: "call-1",
    agentId: "researcher",
    workflowRunId: "run-1",
    runSeq: 2,
    at: "2026-01-01T00:00:10.000Z",
  });
  event({
    type: "agent_title_set",
    agentCallId: "call-1",
    agentId: "researcher",
    memoryScope: "conv:1",
    title: "CRISPR delivery",
    runSeq: 3,
    at: "2026-01-01T00:00:11.000Z",
  });
  // Episode 2: standalone and failed.
  event({
    type: "agent_started",
    agentCallId: "call-2",
    agentId: "writer",
    memoryScope: "conv:2",
    runSeq: 1,
    at: "2026-01-02T00:00:00.000Z",
  });
  event({
    type: "agent_failed",
    agentCallId: "call-2",
    agentId: "writer",
    error: { message: "boom" },
    runSeq: 2,
    at: "2026-01-02T00:00:05.000Z",
  });
  // Episode 3: still running when the process stopped.
  event({
    type: "agent_started",
    agentCallId: "call-3",
    agentId: "researcher",
    memoryScope: "conv:3",
    runSeq: 1,
    at: "2026-01-03T00:00:00.000Z",
  });

  // A pre-existing UI-owned conversation row, which must not be disturbed.
  sqlite
    .prepare(
      `INSERT INTO adl_inspector_sessions
        (memory_scope, agent_id, agent_call_id, title, created_at, updated_at, fork_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "conv:9",
      "researcher",
      "call-9",
      "Named in the UI",
      "2025-12-01T00:00:00.000Z",
      "2025-12-02T00:00:00.000Z",
      '{"sourceMemoryScope":"conv:0"}',
    );
  sqlite
    .prepare(`INSERT INTO adl_messages (memory_scope, messages_json, updated_at) VALUES (?, ?, ?)`)
    .run("conv:1", '[{"role":"user","content":"hi"}]', "2026-01-01T00:00:00.000Z");

  return sqlite;
}

describe("backfillProjections", () => {
  it("rebuilds both new tables from a pre-migration database's retained events", () => {
    const sqlite = createPreMigrationDatabase();

    ensureAdlSchema(sqlite);

    const episodes = sqlite
      .prepare(`SELECT * FROM adl_agent_episodes ORDER BY started_at ASC`)
      .all() as Record<string, unknown>[];
    expect(episodes).toHaveLength(3);
    expect(episodes[0]).toMatchObject({
      agent_call_id: "call-1",
      agent_id: "researcher",
      memory_scope: "conv:1",
      workflow_run_id: "run-1",
      step_id: "step-1",
      started_at: "2026-01-01T00:00:00.000Z",
      // Terminal state came from a *second* event, replayed in order.
      status: "ok",
      finished_at: "2026-01-01T00:00:10.000Z",
    });
    expect(episodes[1]).toMatchObject({
      agent_call_id: "call-2",
      status: "error",
      finished_at: "2026-01-02T00:00:05.000Z",
    });
    // Never finished, so it stays running with no finishedAt.
    expect(episodes[2]).toMatchObject({
      agent_call_id: "call-3",
      status: "running",
      finished_at: null,
    });

    // The title event produced a conversation row that never existed before.
    const backfilled = sqlite
      .prepare(`SELECT * FROM adl_conversation_metadata WHERE memory_scope = ?`)
      .get("conv:1") as Record<string, unknown>;
    expect(backfilled).toMatchObject({
      memory_scope: "conv:1",
      agent_id: "researcher",
      agent_call_id: "call-1",
      title: "CRISPR delivery",
    });
  });

  it("migrates the pre-existing rows without loss", () => {
    const sqlite = createPreMigrationDatabase();

    ensureAdlSchema(sqlite);

    // The UI-owned row came across the rename and the NOT NULL rebuild intact,
    // and the backfill did not overwrite it (no title event names conv:9).
    const kept = sqlite
      .prepare(`SELECT * FROM adl_conversation_metadata WHERE memory_scope = ?`)
      .get("conv:9") as Record<string, unknown>;
    expect(kept).toMatchObject({
      agent_id: "researcher",
      agent_call_id: "call-9",
      title: "Named in the UI",
      created_at: "2025-12-01T00:00:00.000Z",
      updated_at: "2025-12-02T00:00:00.000Z",
      fork_json: '{"sourceMemoryScope":"conv:0"}',
    });

    // Events survived the table rename and the seq -> run_seq column rename.
    const events = sqlite.prepare(`SELECT COUNT(*) AS n FROM adl_run_events`).get() as {
      n: number;
    };
    expect(events.n).toBe(6);
    const first = sqlite
      .prepare(`SELECT run_seq, type FROM adl_run_events ORDER BY id ASC LIMIT 1`)
      .get() as { run_seq: number; type: string };
    expect(first).toEqual({ run_seq: 1, type: "agent_started" });

    // Unrelated tables untouched.
    const message = sqlite
      .prepare(`SELECT messages_json FROM adl_messages WHERE memory_scope = ?`)
      .get("conv:1") as { messages_json: string };
    expect(message.messages_json).toBe('[{"role":"user","content":"hi"}]');
  });

  it("does not re-run once the tables are populated", () => {
    const sqlite = createPreMigrationDatabase();
    ensureAdlSchema(sqlite);

    // Mutate a projected row, then re-open: a backfill that fired again would
    // overwrite this from the log.
    sqlite
      .prepare(`UPDATE adl_agent_episodes SET agent_id = ? WHERE agent_call_id = ?`)
      .run("edited-by-hand", "call-1");

    ensureAdlSchema(sqlite);

    const row = sqlite
      .prepare(`SELECT agent_id FROM adl_agent_episodes WHERE agent_call_id = ?`)
      .get("call-1") as { agent_id: string };
    expect(row.agent_id).toBe("edited-by-hand");
  });

  it("does nothing on a fresh database with no events", () => {
    const sqlite = new Database(":memory:");
    ensureAdlSchema(sqlite);
    const episodes = sqlite.prepare(`SELECT COUNT(*) AS n FROM adl_agent_episodes`).get() as {
      n: number;
    };
    expect(episodes.n).toBe(0);
  });

  it("records every backfill key in the ledger, even with nothing to replay", () => {
    const sqlite = new Database(":memory:");
    ensureAdlSchema(sqlite);
    // Recorded on a fresh database too, so the log is not rescanned on every
    // open once events start accumulating through the live write path.
    const recorded = (
      sqlite.prepare(`SELECT id FROM adl_schema_migrations ORDER BY id ASC`).all() as {
        id: string;
      }[]
    ).map((row) => row.id);
    expect(recorded).toEqual([...backfillKeys()].sort());
  });

  it("backfills a table that already has rows, which an empty-table check could not", () => {
    // The regression this ledger exists for: adl_conversation_metadata is the
    // renamed adl_inspector_sessions, so it is never empty on an upgraded
    // database, and an emptiness heuristic skipped its backfill silently.
    const sqlite = createPreMigrationDatabase();
    ensureAdlSchema(sqlite);

    const rows = (
      sqlite
        .prepare(`SELECT memory_scope FROM adl_conversation_metadata ORDER BY memory_scope ASC`)
        .all() as { memory_scope: string }[]
    ).map((row) => row.memory_scope);
    // conv:1 came from replaying agent_title_set; conv:9 was already there.
    expect(rows).toEqual(["conv:1", "conv:9"]);
  });

  it("re-runs a backfill whose key is bumped", () => {
    const sqlite = createPreMigrationDatabase();
    ensureAdlSchema(sqlite);

    // Simulate a fixed projection shipping under a new key: drop the recorded
    // key and the rows, then re-open.
    sqlite.prepare(`DELETE FROM adl_schema_migrations WHERE id LIKE ?`).run("%agent_episodes%");
    sqlite.prepare(`DELETE FROM adl_agent_episodes`).run();

    ensureAdlSchema(sqlite);

    const episodes = sqlite.prepare(`SELECT COUNT(*) AS n FROM adl_agent_episodes`).get() as {
      n: number;
    };
    expect(episodes.n).toBe(3);
  });
});
