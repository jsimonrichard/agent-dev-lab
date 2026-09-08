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
  `CREATE TABLE IF NOT EXISTS adl_run_events (
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
  `CREATE TABLE IF NOT EXISTS adl_workflow_run_tags (
    workflow_run_id TEXT NOT NULL,
    tag TEXT NOT NULL,
    PRIMARY KEY (workflow_run_id, tag)
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
  `CREATE INDEX IF NOT EXISTS adl_run_events_run_seq
    ON adl_run_events (workflow_run_id, run_seq)`,
  `CREATE INDEX IF NOT EXISTS adl_run_events_agent_seq
    ON adl_run_events (agent_call_id, run_seq)`,
  `CREATE INDEX IF NOT EXISTS adl_run_events_type
    ON adl_run_events (type)`,
  `CREATE INDEX IF NOT EXISTS adl_workflow_run_tags_tag
    ON adl_workflow_run_tags (tag)`,
];

const COLUMN_MIGRATIONS: { table: string; column: string; sqlType: string }[] = [
  { table: "adl_workflow_runs", column: "title", sqlType: "TEXT" },
  { table: "adl_inspector_sessions", column: "deleted_at", sqlType: "TEXT" },
];

/**
 * The log holds every {@link RunEvent} — agent episodes and standalone
 * conversations included — so `adl_workflow_events` named one of its writers
 * rather than its contents.
 */
const TABLE_RENAMES: { from: string; to: string }[] = [
  { from: "adl_workflow_events", to: "adl_run_events" },
];

/**
 * SQLite keeps an index's own name when its table is renamed, so the
 * pre-rename names survive attached to `adl_run_events` and the
 * `CREATE INDEX IF NOT EXISTS` list above would add a second index over the
 * same columns. Drop the old names before creating the new ones.
 */
const STALE_INDEXES = [
  "adl_workflow_events_run_seq",
  "adl_workflow_events_agent_seq",
  "adl_workflow_events_type",
];

/** Pre-0.0.1 local DBs used `seq`; the published schema is `run_seq`. */
const COLUMN_RENAMES: { table: string; from: string; to: string }[] = [
  { table: "adl_run_events", from: "seq", to: "run_seq" },
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

function tableExists(sqlite: AdlSqliteDatabase, table: string): boolean {
  // A miss is `null` under bun:sqlite and `undefined` under better-sqlite3, and
  // this package runs on both — so test truthiness, never against one of them.
  const row = sqlite
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(table) as { name: string } | null | undefined;
  return Boolean(row);
}

/**
 * Renames a table, or does nothing when the rename has already happened.
 *
 * Throws when both names exist: that means a half-applied migration or a
 * hand-made table, and picking either one silently would orphan the rows in
 * the other.
 */
function renameTableIfPresent(sqlite: AdlSqliteDatabase, from: string, to: string): void {
  const fromExists = tableExists(sqlite, from);
  const toExists = tableExists(sqlite, to);
  if (fromExists && toExists) {
    throw new Error(
      `ADL schema migration cannot rename ${from} to ${to}: both tables exist. ` +
        `Merge or drop one by hand — continuing would leave the rows in ${from} unreachable.`,
    );
  }
  if (fromExists) {
    sqlite.exec(`ALTER TABLE ${from} RENAME TO ${to}`);
  }
}

/**
 * Creates ADL tables if they do not exist, and migrates older local databases.
 * Safe to call on every open.
 *
 * Step order is load-bearing: table renames run **before** `CREATE TABLE IF NOT
 * EXISTS`, because a create under the new name would otherwise make an empty
 * table beside the one holding the rows, and the rename would then have nowhere
 * to go. Stale indexes are dropped before the index list is created, since a
 * renamed table keeps its original index names.
 */
export function ensureAdlSchema(sqlite: AdlSqliteDatabase): void {
  sqlite.exec("BEGIN");
  try {
    for (const rename of TABLE_RENAMES) {
      renameTableIfPresent(sqlite, rename.from, rename.to);
    }
    for (const sql of TABLES) {
      sqlite.exec(sql);
    }
    for (const migration of COLUMN_MIGRATIONS) {
      addColumnIfMissing(sqlite, migration.table, migration.column, migration.sqlType);
    }
    for (const rename of COLUMN_RENAMES) {
      renameColumnIfPresent(sqlite, rename.table, rename.from, rename.to);
    }
    for (const name of STALE_INDEXES) {
      sqlite.exec(`DROP INDEX IF EXISTS ${name}`);
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
