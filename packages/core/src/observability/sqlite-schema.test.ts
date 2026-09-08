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
