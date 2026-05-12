import { drizzle } from "drizzle-orm/bun-sqlite";
import { Database } from "bun:sqlite";
import * as schema from "./schema.js";

const defaultPath = process.env.ADL_SQLITE_PATH ?? ".data/agent-dev-lab.sqlite";

/**
 * Opens the shared SQLite database (Bun). Schema is intentionally minimal so
 * storage models can evolve without repo-wide churn.
 */
export function createDb(path: string = defaultPath) {
  const sqlite = new Database(path, { create: true });
  return drizzle(sqlite, { schema });
}

export type Db = ReturnType<typeof createDb>;

export type { RunRow } from "./schema.js";
export { schema };
