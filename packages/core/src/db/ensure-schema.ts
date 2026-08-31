import type { AdlSqliteDatabase } from "./sqlite-types";

const TABLES = [
  `CREATE TABLE IF NOT EXISTS adl_messages (
    memory_scope TEXT PRIMARY KEY NOT NULL,
    messages_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS adl_workflow_runs (
    workflow_run_id TEXT PRIMARY KEY NOT NULL,
    workflow_id TEXT NOT NULL,
    status TEXT NOT NULL,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    input_json TEXT,
    output_json TEXT,
    title TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS adl_workflow_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workflow_run_id TEXT,
    agent_call_id TEXT,
    run_seq INTEGER NOT NULL,
    type TEXT NOT NULL,
    at TEXT NOT NULL,
    event_schema_version INTEGER NOT NULL DEFAULT 1,
    payload_json TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS adl_step_outputs (
    workflow_run_id TEXT NOT NULL,
    slot_key TEXT NOT NULL,
    output_json TEXT NOT NULL,
    PRIMARY KEY (workflow_run_id, slot_key)
  )`,
  `CREATE TABLE IF NOT EXISTS adl_step_records (
    workflow_run_id TEXT NOT NULL,
    step_id TEXT NOT NULL,
    name TEXT NOT NULL,
    key TEXT,
    path_json TEXT NOT NULL,
    parent_step_id TEXT,
    output_json TEXT,
    status TEXT NOT NULL,
    PRIMARY KEY (workflow_run_id, step_id)
  )`,
  `CREATE TABLE IF NOT EXISTS adl_inspector_sessions (
    memory_scope TEXT PRIMARY KEY NOT NULL,
    agent_id TEXT NOT NULL,
    agent_call_id TEXT NOT NULL,
    title TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    fork_json TEXT,
    deleted_at TEXT
  )`,
];

const INDEXES = [
  `CREATE INDEX IF NOT EXISTS adl_workflow_events_run_seq
    ON adl_workflow_events (workflow_run_id, run_seq)`,
  `CREATE INDEX IF NOT EXISTS adl_workflow_events_agent_seq
    ON adl_workflow_events (agent_call_id, run_seq)`,
  `CREATE INDEX IF NOT EXISTS adl_workflow_events_type
    ON adl_workflow_events (type)`,
];

const COLUMN_MIGRATIONS: { table: string; column: string; sqlType: string }[] = [
  { table: "adl_workflow_runs", column: "title", sqlType: "TEXT" },
  { table: "adl_inspector_sessions", column: "deleted_at", sqlType: "TEXT" },
];

/** Pre-0.0.1 local DBs used `seq`; the published schema is `run_seq`. */
const COLUMN_RENAMES: { table: string; from: string; to: string }[] = [
  { table: "adl_workflow_events", from: "seq", to: "run_seq" },
];

type PragmaColumn = { name: string };

function tableColumns(sqlite: AdlSqliteDatabase, table: string): PragmaColumn[] {
  return sqlite.prepare(`PRAGMA table_info(${table})`).all() as PragmaColumn[];
}

function addColumnIfMissing(
  sqlite: AdlSqliteDatabase,
  table: string,
  column: string,
  sqlType: string,
): void {
  if (tableColumns(sqlite, table).some((col) => col.name === column)) {
    return;
  }
  sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${sqlType}`);
}

function renameColumnIfPresent(
  sqlite: AdlSqliteDatabase,
  table: string,
  from: string,
  to: string,
): void {
  const names = new Set(tableColumns(sqlite, table).map((col) => col.name));
  if (names.has(from) && !names.has(to)) {
    sqlite.exec(`ALTER TABLE ${table} RENAME COLUMN ${from} TO ${to}`);
  }
}

/** Creates ADL tables if they do not exist. Safe to call on every open. */
export function ensureAdlSchema(sqlite: AdlSqliteDatabase): void {
  sqlite.exec("BEGIN");
  try {
    for (const sql of TABLES) {
      sqlite.exec(sql);
    }
    for (const migration of COLUMN_MIGRATIONS) {
      addColumnIfMissing(sqlite, migration.table, migration.column, migration.sqlType);
    }
    for (const rename of COLUMN_RENAMES) {
      renameColumnIfPresent(sqlite, rename.table, rename.from, rename.to);
    }
    for (const sql of INDEXES) {
      sqlite.exec(sql);
    }
    sqlite.exec("COMMIT");
  } catch (error) {
    sqlite.exec("ROLLBACK");
    throw error;
  }
}
