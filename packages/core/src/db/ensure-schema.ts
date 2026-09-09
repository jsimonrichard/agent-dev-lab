import { sql } from "drizzle-orm";

import type { AdlSqliteDatabase } from "./sqlite-types";
import { wrapAdlDb, type AdlDb } from "./wrap-drizzle";

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
  `CREATE TABLE IF NOT EXISTS adl_conversation_metadata (
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
  { table: "adl_conversation_metadata", column: "deleted_at", sqlType: "TEXT" },
];

/**
 * - `adl_workflow_events` → `adl_run_events`: the log holds every
 *   {@link RunEvent} — agent episodes and standalone conversations included —
 *   so the old name described one of its writers rather than its contents.
 * - `adl_inspector_sessions` → `adl_conversation_metadata`: named for what it
 *   is, metadata *about* a conversation, not the source of truth for message
 *   content (that stays `adl_messages`). The old name described the writer
 *   (the inspection UI) rather than the entity — core's own vocabulary is
 *   "conversation" throughout (`conversation-title.ts`, `ConversationTitleInput`).
 */
const TABLE_RENAMES: { from: string; to: string }[] = [
  { from: "adl_workflow_events", to: "adl_run_events" },
  { from: "adl_inspector_sessions", to: "adl_conversation_metadata" },
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

// PRAGMA doesn't accept a bound parameter for its target, so `table` is
// interpolated with sql.raw() below — as it always was via raw string
// interpolation. Safe: every caller passes a name from the static arrays
// above, never external input. `db.all()` (not `db.get()`) is deliberate:
// verified against both drivers that `db.get()` on a query with no field
// mapping returns array-mode rows under bun:sqlite but object-mode rows
// under better-sqlite3 (an accessor by *position* would silently read the
// wrong thing on one driver); `db.all()` returns object-mode rows on both.
function tableColumns(db: AdlDb, table: string): PragmaColumn[] {
  return db.all<PragmaColumn>(sql.raw(`PRAGMA table_info(${table})`));
}

function addColumnIfMissing(db: AdlDb, table: string, column: string, sqlType: string): void {
  if (tableColumns(db, table).some((col) => col.name === column)) {
    return;
  }
  db.run(sql.raw(`ALTER TABLE ${table} ADD COLUMN ${column} ${sqlType}`));
}

function renameColumnIfPresent(db: AdlDb, table: string, from: string, to: string): void {
  const names = new Set(tableColumns(db, table).map((col) => col.name));
  if (names.has(from) && !names.has(to)) {
    db.run(sql.raw(`ALTER TABLE ${table} RENAME COLUMN ${from} TO ${to}`));
  }
}

function tableExists(db: AdlDb, table: string): boolean {
  // See the db.all() vs db.get() note on tableColumns above — same reason
  // this reads .length rather than reaching for db.get() + Boolean().
  const rows = db.all<{ name: string }>(
    sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ${table}`,
  );
  return rows.length > 0;
}

/**
 * Renames a table, or does nothing when the rename has already happened.
 *
 * Throws when both names exist: that means a half-applied migration or a
 * hand-made table, and picking either one silently would orphan the rows in
 * the other.
 */
function renameTableIfPresent(db: AdlDb, from: string, to: string): void {
  const fromExists = tableExists(db, from);
  const toExists = tableExists(db, to);
  if (fromExists && toExists) {
    throw new Error(
      `ADL schema migration cannot rename ${from} to ${to}: both tables exist. ` +
        `Merge or drop one by hand — continuing would leave the rows in ${from} unreachable.`,
    );
  }
  if (fromExists) {
    db.run(sql.raw(`ALTER TABLE ${from} RENAME TO ${to}`));
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
 *
 * Runs through the driver's own transaction wrapper (`db.transaction`) rather
 * than hand-written `BEGIN`/`COMMIT`/`ROLLBACK` — verified against both bun's
 * and better-sqlite3's drizzle adapters that a thrown error inside auto-rolls
 * back and re-throws, matching this function's previous manual behavior.
 */
export function ensureAdlSchema(sqlite: AdlSqliteDatabase): void {
  const db = wrapAdlDb(sqlite);
  db.transaction((tx) => {
    for (const rename of TABLE_RENAMES) {
      renameTableIfPresent(tx, rename.from, rename.to);
    }
    for (const statement of TABLES) {
      tx.run(sql.raw(statement));
    }
    for (const migration of COLUMN_MIGRATIONS) {
      addColumnIfMissing(tx, migration.table, migration.column, migration.sqlType);
    }
    for (const rename of COLUMN_RENAMES) {
      renameColumnIfPresent(tx, rename.table, rename.from, rename.to);
    }
    for (const name of STALE_INDEXES) {
      tx.run(sql.raw(`DROP INDEX IF EXISTS ${name}`));
    }
    for (const statement of INDEXES) {
      tx.run(sql.raw(statement));
    }
  });
}
