/**
 * SQLite helpers published as `@agent-dev-lab/core/db`.
 * Used by message/workflow stores; also the package export for schema and open helpers.
 */
import { mkdirSync } from "node:fs";
import path from "node:path";

import { sql } from "drizzle-orm";

import { ensureAdlSchema } from "./ensure-schema";
import { isBunRuntime, packageRequire as require } from "./runtime";
import type { AdlSqliteDatabase } from "./sqlite-types";
import { wrapAdlDb, type AdlDb } from "./wrap-drizzle";

export type { AdlSqliteDatabase, AdlSqliteStatement } from "./sqlite-types";
export type { AdlDb } from "./wrap-drizzle";

export const DEFAULT_SQLITE_RELATIVE_PATH = ".data/agent-dev-lab.sqlite";

type CachedDb = {
  sqlite: AdlSqliteDatabase;
  db: AdlDb;
};

const dbCache = new Map<string, CachedDb>();

/**
 * Resolves the SQLite file path: absolute `ADL_SQLITE_PATH` as-is, otherwise
 * relative to `projectRoot` (or `process.cwd()`).
 */
export function resolveAdlSqlitePath(projectRoot?: string): string {
  const raw = process.env.ADL_SQLITE_PATH ?? DEFAULT_SQLITE_RELATIVE_PATH;
  if (path.isAbsolute(raw)) {
    return raw;
  }
  return path.resolve(projectRoot ?? process.cwd(), raw);
}

function cacheKey(resolvedPath: string): string {
  return resolvedPath;
}

function openWithBun(resolved: string): CachedDb {
  // bun:sqlite must not be a static import — Node builds cannot resolve it.
  const { Database } = require("bun:sqlite") as typeof import("bun:sqlite");
  const sqlite = new Database(resolved) as AdlSqliteDatabase;
  const db = wrapAdlDb(sqlite);
  db.run(sql.raw("PRAGMA journal_mode = WAL;"));
  db.run(sql.raw("PRAGMA foreign_keys = ON;"));
  ensureAdlSchema(sqlite);
  return { sqlite, db };
}

function openWithBetterSqlite(resolved: string): CachedDb {
  const Database = require("better-sqlite3") as typeof import("better-sqlite3");
  const sqlite = new Database(resolved) as AdlSqliteDatabase;
  const db = wrapAdlDb(sqlite);
  db.run(sql.raw("PRAGMA journal_mode = WAL;"));
  db.run(sql.raw("PRAGMA foreign_keys = ON;"));
  ensureAdlSchema(sqlite);
  return { sqlite, db };
}

/**
 * Opens (and caches) a SQLite database, creating parent directories and applying
 * the ADL schema on first open.
 *
 * - **Bun:** `bun:sqlite` (native addon of better-sqlite3 is unreliable under Bun)
 * - **Node 22+:** `better-sqlite3` (no Bun relaunch required for `adl`)
 */
export function openAdlSqlite(sqlitePath?: string): AdlSqliteDatabase {
  const resolved = sqlitePath ?? resolveAdlSqlitePath();
  const key = cacheKey(resolved);
  const cached = dbCache.get(key);
  if (cached) {
    return cached.sqlite;
  }

  if (resolved !== ":memory:") {
    mkdirSync(path.dirname(resolved), { recursive: true });
  }

  const entry = isBunRuntime() ? openWithBun(resolved) : openWithBetterSqlite(resolved);
  dbCache.set(key, entry);
  return entry.sqlite;
}

/**
 * Opens the shared SQLite database and returns a Drizzle client.
 * Schema is applied automatically on first open.
 */
export function createDb(sqlitePath?: string): AdlDb {
  const resolved = sqlitePath ?? resolveAdlSqlitePath();
  const key = cacheKey(resolved);
  openAdlSqlite(resolved);
  return dbCache.get(key)!.db;
}

export type Db = ReturnType<typeof createDb>;

export type { MessageRow, WorkflowRunRow } from "./schema";
export * as schema from "./schema";
export { ensureAdlSchema } from "./ensure-schema";
