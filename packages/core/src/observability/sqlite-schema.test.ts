import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";

import { ensureAdlSchema } from "../db";

import { sqliteWorkflowStore } from "./sqlite-workflow-store";
import { EVENT_SCHEMA_VERSION } from "./events";

type PragmaColumn = { name: string };

function columnNames(sqlite: Database, table: string): string[] {
  return (sqlite.prepare(`PRAGMA table_info(${table})`).all() as PragmaColumn[]).map(
    (col) => col.name,
  );
}

function indexNames(sqlite: Database, table: string): string[] {
  return (
    sqlite
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = ?`)
      .all(table) as { name: string }[]
  ).map((row) => row.name);
}

function tableNames(sqlite: Database): string[] {
  return (
    sqlite.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as {
      name: string;
    }[]
  ).map((row) => row.name);
}

/** A pre-rename database: old table name, and the pre-0.0.1 `seq` column. */
function createLegacyEventsTable(sqlite: Database): void {
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
  sqlite
    .prepare(
      `INSERT INTO adl_workflow_events
        (workflow_run_id, agent_call_id, seq, type, at, event_schema_version, payload_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run("run-1", null, 1, "workflow_started", "2026-01-01T00:00:00.000Z", 1, "{}");
}

describe("adl_run_events", () => {
  it("creates run_seq on a fresh database", () => {
    const sqlite = new Database(":memory:");
    ensureAdlSchema(sqlite);
    const names = columnNames(sqlite, "adl_run_events");
    expect(names).toContain("run_seq");
    expect(names).not.toContain("seq");
    expect(tableNames(sqlite)).not.toContain("adl_workflow_events");
  });

  it("renames a pre-release adl_workflow_events table and keeps its rows", () => {
    const sqlite = new Database(":memory:");
    createLegacyEventsTable(sqlite);

    ensureAdlSchema(sqlite);

    const tables = tableNames(sqlite);
    expect(tables).toContain("adl_run_events");
    expect(tables).not.toContain("adl_workflow_events");

    const names = columnNames(sqlite, "adl_run_events");
    expect(names).toContain("run_seq");
    expect(names).not.toContain("seq");

    const row = sqlite
      .prepare("SELECT run_seq FROM adl_run_events WHERE workflow_run_id = ?")
      .get("run-1") as { run_seq: number };
    expect(row.run_seq).toBe(1);
  });

  it("drops the pre-rename index instead of duplicating it", () => {
    // SQLite keeps an index's own name across ALTER TABLE ... RENAME TO, so
    // creating the new name without dropping the old leaves two indexes over
    // the same columns.
    const sqlite = new Database(":memory:");
    createLegacyEventsTable(sqlite);

    ensureAdlSchema(sqlite);

    const indexes = indexNames(sqlite, "adl_run_events");
    expect(indexes).toContain("adl_run_events_run_seq");
    expect(indexes).not.toContain("adl_workflow_events_run_seq");
  });

  it("refuses to migrate when both table names exist", () => {
    const sqlite = new Database(":memory:");
    createLegacyEventsTable(sqlite);
    sqlite.exec(`CREATE TABLE adl_run_events (id INTEGER PRIMARY KEY AUTOINCREMENT)`);

    // Fail closed: picking either table would orphan the other's rows.
    expect(() => ensureAdlSchema(sqlite)).toThrow(/both tables exist/);
    expect(tableNames(sqlite)).toContain("adl_workflow_events");
  });

  it("orders persisted events by run_seq", async () => {
    const store = sqliteWorkflowStore({ path: ":memory:" });
    await store.recordEvent({
      type: "workflow_started",
      workflowRunId: "run-1",
      workflowId: "demo",
      input: { n: 1 },
      runSeq: 1,
      at: "2026-01-01T00:00:00.000Z",
      eventSchemaVersion: EVENT_SCHEMA_VERSION,
    });
    await store.recordEvent({
      type: "workflow_finished",
      workflowRunId: "run-1",
      output: { n: 1 },
      runSeq: 2,
      at: "2026-01-01T00:00:01.000Z",
      eventSchemaVersion: EVENT_SCHEMA_VERSION,
    });
    const events = await store.listEvents({ workflowRunId: "run-1" });
    expect(events.map((event) => event.runSeq)).toEqual([1, 2]);
  });
});

/** A pre-rename database: old table name, and no `deleted_at` column yet. */
function createLegacyInspectorSessionsTable(sqlite: Database): void {
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
  sqlite
    .prepare(
      `INSERT INTO adl_inspector_sessions
        (memory_scope, agent_id, agent_call_id, title, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "scope-1",
      "agent-1",
      "call-1",
      "My chat",
      "2026-01-01T00:00:00.000Z",
      "2026-01-01T00:00:00.000Z",
    );
}

describe("adl_conversation_metadata", () => {
  it("creates the table under its new name on a fresh database", () => {
    const sqlite = new Database(":memory:");
    ensureAdlSchema(sqlite);
    const tables = tableNames(sqlite);
    expect(tables).toContain("adl_conversation_metadata");
    expect(tables).not.toContain("adl_inspector_sessions");
    expect(columnNames(sqlite, "adl_conversation_metadata")).toContain("deleted_at");
  });

  it("renames a pre-release adl_inspector_sessions table and keeps its rows", () => {
    const sqlite = new Database(":memory:");
    createLegacyInspectorSessionsTable(sqlite);

    ensureAdlSchema(sqlite);

    const tables = tableNames(sqlite);
    expect(tables).toContain("adl_conversation_metadata");
    expect(tables).not.toContain("adl_inspector_sessions");

    const row = sqlite
      .prepare("SELECT title, deleted_at FROM adl_conversation_metadata WHERE memory_scope = ?")
      .get("scope-1") as { title: string; deleted_at: string | null };
    expect(row.title).toBe("My chat");
    expect(row.deleted_at).toBeNull();
  });

  it("keeps the primary key enforced after the rename", () => {
    // SQLite renames a table's own PRIMARY KEY autoindex along with the table
    // (unlike an explicitly-named CREATE INDEX, which keeps its old name — see
    // the adl_run_events tests above), so this table needs no STALE_INDEXES
    // entry. Verified by exercising the constraint, not just reading pragmas.
    const sqlite = new Database(":memory:");
    createLegacyInspectorSessionsTable(sqlite);
    ensureAdlSchema(sqlite);

    expect(() =>
      sqlite
        .prepare(
          `INSERT INTO adl_conversation_metadata
            (memory_scope, agent_id, agent_call_id, title, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          "scope-1",
          "agent-2",
          "call-2",
          "dup",
          "2026-01-02T00:00:00.000Z",
          "2026-01-02T00:00:00.000Z",
        ),
    ).toThrow(/UNIQUE constraint failed/);
  });

  it("refuses to migrate when both table names exist", () => {
    const sqlite = new Database(":memory:");
    createLegacyInspectorSessionsTable(sqlite);
    sqlite.exec(`CREATE TABLE adl_conversation_metadata (memory_scope TEXT PRIMARY KEY NOT NULL)`);

    expect(() => ensureAdlSchema(sqlite)).toThrow(/both tables exist/);
    expect(tableNames(sqlite)).toContain("adl_inspector_sessions");
  });
});

describe("adl_conversation_metadata.agent_call_id nullability", () => {
  /** Pre-relaxation shape: agent_call_id NOT NULL, already at the new table name. */
  function createNotNullTable(sqlite: Database): void {
    sqlite.exec(`
      CREATE TABLE adl_conversation_metadata (
        memory_scope TEXT PRIMARY KEY NOT NULL,
        agent_id TEXT NOT NULL,
        agent_call_id TEXT NOT NULL,
        title TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        fork_json TEXT,
        deleted_at TEXT
      )
    `);
  }

  function notNullFlag(sqlite: Database, table: string, column: string): number | undefined {
    return (
      sqlite.prepare(`PRAGMA table_info(${table})`).all() as {
        name: string;
        notnull: number;
      }[]
    ).find((col) => col.name === column)?.notnull;
  }

  it("is nullable on a fresh database", () => {
    const sqlite = new Database(":memory:");
    ensureAdlSchema(sqlite);
    expect(notNullFlag(sqlite, "adl_conversation_metadata", "agent_call_id")).toBe(0);
  });

  it("rebuilds an older NOT NULL table, preserving every row and column", () => {
    const sqlite = new Database(":memory:");
    createNotNullTable(sqlite);
    sqlite
      .prepare(
        `INSERT INTO adl_conversation_metadata
          (memory_scope, agent_id, agent_call_id, title, created_at, updated_at, fork_json, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        "conv:1",
        "researcher",
        "call-1",
        "Kept title",
        "2026-01-01T00:00:00.000Z",
        "2026-01-02T00:00:00.000Z",
        '{"sourceMemoryScope":"conv:0"}',
        "2026-01-03T00:00:00.000Z",
      );
    expect(notNullFlag(sqlite, "adl_conversation_metadata", "agent_call_id")).toBe(1);

    ensureAdlSchema(sqlite);

    expect(notNullFlag(sqlite, "adl_conversation_metadata", "agent_call_id")).toBe(0);
    // The rebuild drops the old table, so row preservation is the thing to prove.
    const row = sqlite
      .prepare(`SELECT * FROM adl_conversation_metadata WHERE memory_scope = ?`)
      .get("conv:1") as Record<string, string | null>;
    expect(row).toMatchObject({
      memory_scope: "conv:1",
      agent_id: "researcher",
      agent_call_id: "call-1",
      title: "Kept title",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-02T00:00:00.000Z",
      fork_json: '{"sourceMemoryScope":"conv:0"}',
      deleted_at: "2026-01-03T00:00:00.000Z",
    });
    // Primary key survives the rebuild.
    expect(notNullFlag(sqlite, "adl_conversation_metadata", "memory_scope")).toBe(1);
    expect(() =>
      sqlite
        .prepare(
          `INSERT INTO adl_conversation_metadata
            (memory_scope, agent_id, title, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run("conv:1", "x", "dup", "2026-01-04T00:00:00.000Z", "2026-01-04T00:00:00.000Z"),
    ).toThrow(/UNIQUE constraint failed/);

    // And no rebuild scaffolding is left behind.
    expect(tableNames(sqlite)).not.toContain("adl_conversation_metadata_rebuild");
  });

  it("accepts a row with no agent_call_id after migrating, and is idempotent", () => {
    const sqlite = new Database(":memory:");
    createNotNullTable(sqlite);
    ensureAdlSchema(sqlite);
    // Second call must not rebuild again (guarded on the current shape).
    ensureAdlSchema(sqlite);

    sqlite
      .prepare(
        `INSERT INTO adl_conversation_metadata
          (memory_scope, agent_id, title, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        "fork:abc",
        "researcher",
        "Fork · notes",
        "2026-01-01T00:00:00.000Z",
        "2026-01-01T00:00:00.000Z",
      );
    const row = sqlite
      .prepare(`SELECT agent_call_id FROM adl_conversation_metadata WHERE memory_scope = ?`)
      .get("fork:abc") as { agent_call_id: string | null };
    expect(row.agent_call_id).toBeNull();
  });
});

describe("adl_agent_episodes", () => {
  it("creates the table with its lifecycle and model-descriptor columns", () => {
    const sqlite = new Database(":memory:");
    ensureAdlSchema(sqlite);
    expect(tableNames(sqlite)).toContain("adl_agent_episodes");
    expect(columnNames(sqlite, "adl_agent_episodes")).toEqual([
      "agent_call_id",
      "agent_id",
      "memory_scope",
      "workflow_run_id",
      "step_id",
      "started_at",
      "finished_at",
      "status",
      "model_id",
      "model_provider",
    ]);
    const indexes = indexNames(sqlite, "adl_agent_episodes");
    expect(indexes).toContain("adl_agent_episodes_started_at");
    expect(indexes).toContain("adl_agent_episodes_agent_started_at");
  });
});
