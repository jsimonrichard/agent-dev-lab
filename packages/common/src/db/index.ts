import { mkdirSync } from "node:fs";
import path from "node:path";

import { drizzle } from "drizzle-orm/bun-sqlite";
import { Database } from "bun:sqlite";

import { ensureAdlSchema } from "./ensure-schema.js";
import * as schema from "./schema.js";

export const DEFAULT_SQLITE_RELATIVE_PATH = ".data/agent-dev-lab.sqlite";

const dbCache = new Map<
  string,
  { sqlite: Database; db: ReturnType<typeof drizzle<typeof schema>> }
>();

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

/**
 * Opens (and caches) a Bun SQLite database, creating parent directories and
 * applying the ADL schema on first open.
 */
export function openAdlSqlite(sqlitePath?: string): Database {
  const resolved = sqlitePath ?? resolveAdlSqlitePath();
  const key = cacheKey(resolved);
  const cached = dbCache.get(key);
  if (cached) {
    return cached.sqlite;
  }

  if (resolved !== ":memory:") {
    mkdirSync(path.dirname(resolved), { recursive: true });
  }

  const sqlite = new Database(resolved, { create: true });
  sqlite.exec("PRAGMA journal_mode = WAL;");
  sqlite.exec("PRAGMA foreign_keys = ON;");
  ensureAdlSchema(sqlite);

  const db = drizzle(sqlite, { schema });
  dbCache.set(key, { sqlite, db });
  return sqlite;
}

/**
 * Opens the shared SQLite database (Bun) and returns a Drizzle client.
 * Schema is applied automatically on first open.
 */
export function createDb(sqlitePath?: string) {
  const resolved = sqlitePath ?? resolveAdlSqlitePath();
  const key = cacheKey(resolved);
  openAdlSqlite(resolved);
  return dbCache.get(key)!.db;
}

export type Db = ReturnType<typeof createDb>;

export type { MessageRow, WorkflowRunRow } from "./schema.js";
export { schema };
export { ensureAdlSchema } from "./ensure-schema.js";
