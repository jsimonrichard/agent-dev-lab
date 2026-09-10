import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { is } from "drizzle-orm";
import { getTableConfig, SQLiteTable } from "drizzle-orm/sqlite-core";

import { ensureAdlSchema } from "./ensure-schema";
import * as schema from "./schema";

/**
 * `schema.ts` (what drizzle and `drizzle-kit` believe) and `ensure-schema.ts`
 * (the DDL actually applied at runtime) describe the same tables twice, in two
 * hand-maintained places. These tests compare them so the two cannot drift
 * silently, which has already happened twice in this package's history:
 *
 * - Three composite primary keys existed in the runtime DDL and in no drizzle
 *   definition, so `drizzle-kit push` would have built those tables without
 *   their keys — a duplicate-row risk rather than a cosmetic gap.
 * - `schema.ts` kept naming a table `adl_inspector_sessions` after the runtime
 *   DDL had been renamed, so a project bootstrapped via `drizzle-kit push`
 *   would have created the old name permanently.
 *
 * Comparison is semantic — columns, nullability, primary keys, indexes read
 * back through PRAGMA — rather than a diff of generated SQL text, so
 * formatting differences cannot cause a false failure.
 */

type PragmaColumn = { name: string; notnull: number; pk: number };
type PragmaIndex = { name: string; origin: string };
type PragmaIndexColumn = { seqno: number; name: string };

function ensuredDatabase(): Database {
  const sqlite = new Database(":memory:");
  ensureAdlSchema(sqlite);
  return sqlite;
}

/** The drizzle table definitions, keyed by their SQL table name. */
function drizzleTables(): Map<string, SQLiteTable> {
  const tables = new Map<string, SQLiteTable>();
  for (const value of Object.values(schema)) {
    if (is(value, SQLiteTable)) {
      tables.set(getTableConfig(value).name, value);
    }
  }
  return tables;
}

function appliedTableNames(sqlite: Database): string[] {
  return (
    sqlite
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'adl_%'`)
      .all() as { name: string }[]
  )
    .map((row) => row.name)
    .sort();
}

function appliedColumns(sqlite: Database, table: string): PragmaColumn[] {
  return sqlite.prepare(`PRAGMA table_info(${table})`).all() as PragmaColumn[];
}

/** Explicitly created indexes only — `origin` is "pk"/"u" for implicit ones. */
function appliedIndexNames(sqlite: Database, table: string): string[] {
  return (sqlite.prepare(`PRAGMA index_list(${table})`).all() as PragmaIndex[])
    .filter((index) => index.origin === "c")
    .map((index) => index.name)
    .sort();
}

function appliedIndexColumns(sqlite: Database, index: string): string[] {
  return (sqlite.prepare(`PRAGMA index_info(${index})`).all() as PragmaIndexColumn[])
    .sort((left, right) => left.seqno - right.seqno)
    .map((column) => column.name);
}

/** Primary key columns in key order, from the applied schema. */
function appliedPrimaryKey(sqlite: Database, table: string): string[] {
  return appliedColumns(sqlite, table)
    .filter((column) => column.pk > 0)
    .sort((left, right) => left.pk - right.pk)
    .map((column) => column.name);
}

/**
 * Primary key columns in key order, as drizzle describes them. A single-column
 * key is a flag on the column; a composite key is a separate constraint.
 */
function describedPrimaryKey(table: SQLiteTable): string[] {
  const config = getTableConfig(table);
  const composite = config.primaryKeys[0];
  if (composite) {
    return composite.columns.map((column) => column.name);
  }
  return config.columns.filter((column) => column.primary).map((column) => column.name);
}

describe("schema.ts and ensure-schema.ts agree", () => {
  it("describe the same set of tables", () => {
    const sqlite = ensuredDatabase();
    // Both directions on purpose: a table added to only one of the two files
    // is drift whichever file it is missing from.
    expect([...drizzleTables().keys()].sort()).toEqual(appliedTableNames(sqlite));
  });

  it("declare the same columns, with the same nullability", () => {
    const sqlite = ensuredDatabase();
    const described: Record<string, Record<string, boolean>> = {};
    const applied: Record<string, Record<string, boolean>> = {};

    for (const [name, table] of drizzleTables()) {
      // A primary key column's nullability is not comparable between the two
      // sides: SQLite reports notnull=0 for an INTEGER PRIMARY KEY (a rowid
      // alias) and even accepts an explicit NULL there, auto-assigning the
      // rowid, while drizzle reports notNull=true because primaryKey() implies
      // it. Key membership is asserted separately, below.
      const primaryKey = new Set(describedPrimaryKey(table));
      described[name] = Object.fromEntries(
        getTableConfig(table)
          .columns.filter((column) => !primaryKey.has(column.name))
          .map((column) => [column.name, column.notNull]),
      );
      applied[name] = Object.fromEntries(
        appliedColumns(sqlite, name)
          .filter((column) => !primaryKey.has(column.name))
          .map((column) => [column.name, column.notnull === 1]),
      );
    }

    expect(applied).toEqual(described);
  });

  it("declare the same primary keys, including composite ones", () => {
    const sqlite = ensuredDatabase();
    const described: Record<string, string[]> = {};
    const applied: Record<string, string[]> = {};

    for (const [name, table] of drizzleTables()) {
      described[name] = describedPrimaryKey(table);
      applied[name] = appliedPrimaryKey(sqlite, name);
    }

    // This is the assertion that would have caught adl_step_outputs,
    // adl_step_records and adl_workflow_run_tags shipping without their keys
    // in the drizzle definitions.
    expect(applied).toEqual(described);
  });

  it("declare the same indexes, over the same columns", () => {
    const sqlite = ensuredDatabase();
    const described: Record<string, Record<string, string[]>> = {};
    const applied: Record<string, Record<string, string[]>> = {};

    for (const [name, table] of drizzleTables()) {
      described[name] = Object.fromEntries(
        getTableConfig(table)
          .indexes.map((index) => {
            const config = index.config as { name: string; columns?: { name?: string }[] };
            return [
              config.name,
              (config.columns ?? []).map((column) => column.name ?? "<expression>"),
            ] as const;
          })
          .sort((left, right) => left[0].localeCompare(right[0])),
      );
      applied[name] = Object.fromEntries(
        appliedIndexNames(sqlite, name).map(
          (index) => [index, appliedIndexColumns(sqlite, index)] as const,
        ),
      );
    }

    expect(applied).toEqual(described);
  });
});
