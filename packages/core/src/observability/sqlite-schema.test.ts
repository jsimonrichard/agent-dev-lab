import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";

import { ensureAdlSchema } from "@agent-dev-lab/common";

import { sqliteWorkflowStore } from "./sqlite-workflow-store";
import { EVENT_SCHEMA_VERSION } from "./events";

type PragmaColumn = { name: string };

function columnNames(sqlite: Database, table: string): string[] {
  return (sqlite.prepare(`PRAGMA table_info(${table})`).all() as PragmaColumn[]).map(
    (col) => col.name,
  );
}

describe("adl_workflow_events.run_seq", () => {
  it("creates run_seq on a fresh database", () => {
    const sqlite = new Database(":memory:");
    ensureAdlSchema(sqlite);
    const names = columnNames(sqlite, "adl_workflow_events");
    expect(names).toContain("run_seq");
    expect(names).not.toContain("seq");
  });

  it("renames a leftover seq column from pre-release local DBs", () => {
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
    sqlite
      .prepare(
        `INSERT INTO adl_workflow_events
          (workflow_run_id, agent_call_id, seq, type, at, event_schema_version, payload_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run("run-1", null, 1, "workflow_started", "2026-01-01T00:00:00.000Z", 1, "{}");

    ensureAdlSchema(sqlite);

    const names = columnNames(sqlite, "adl_workflow_events");
    expect(names).toContain("run_seq");
    expect(names).not.toContain("seq");
    const row = sqlite
      .prepare("SELECT run_seq FROM adl_workflow_events WHERE workflow_run_id = ?")
      .get("run-1") as { run_seq: number };
    expect(row.run_seq).toBe(1);
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
