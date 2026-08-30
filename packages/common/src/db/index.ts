import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import path from "node:path";

import { ensureAdlSchema } from "./ensure-schema.js";
import * as schema from "./schema.js";
import type { AdlSqliteDatabase } from "./sqlite-types.js";

export type { AdlSqliteDatabase, AdlSqliteStatement } from "./sqlite-types.js";

export const DEFAULT_SQLITE_RELATIVE_PATH = ".data/agent-dev-lab.sqlite";

/**
 * Native SQLite / Drizzle adapters are dependencies of this package. When this
 * module is bundled into another app's SSR output (e.g. inspection UI `.output`),
 * `import.meta.url` points at the chunk and cannot resolve those deps — anchor
 * `require` at the installed `@agent-dev-lab/common` entry instead.
 */
function createPackageRequire(): NodeRequire {
  const fromThisFile = createRequire(import.meta.url);
  try {
    return createRequire(fromThisFile.resolve("@agent-dev-lab/common"));
  } catch {
    return fromThisFile;
  }
}

const require = createPackageRequire();

type CachedDb = {
  sqlite: AdlSqliteDatabase;
  // Drizzle client shape differs slightly between bun-sqlite and better-sqlite3 adapters.
  // Callers use schema-typed queries; keep this opaque at the package boundary.
  db: unknown;
};

const dbCache = new Map<string, CachedDb>();

function isBunRuntime(): boolean {
  return typeof (globalThis as { Bun?: unknown }).Bun !== "undefined";
}

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
  const { drizzle } = require("drizzle-orm/bun-sqlite") as typeof import("drizzle-orm/bun-sqlite");
  const sqlite = new Database(resolved) as AdlSqliteDatabase;
  sqlite.exec("PRAGMA journal_mode = WAL;");
  sqlite.exec("PRAGMA foreign_keys = ON;");
  ensureAdlSchema(sqlite);
  const db = drizzle(sqlite as never, { schema });
  return { sqlite, db };
}

function openWithBetterSqlite(resolved: string): CachedDb {
  const Database = require("better-sqlite3") as typeof import("better-sqlite3");
  const { drizzle } =
    require("drizzle-orm/better-sqlite3") as typeof import("drizzle-orm/better-sqlite3");
  const sqlite = new Database(resolved) as AdlSqliteDatabase;
  sqlite.exec("PRAGMA journal_mode = WAL;");
  sqlite.exec("PRAGMA foreign_keys = ON;");
  ensureAdlSchema(sqlite);
  const db = drizzle(sqlite as never, { schema });
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
