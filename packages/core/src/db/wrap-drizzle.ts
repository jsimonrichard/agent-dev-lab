import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";

import { isBunRuntime, packageRequire as require } from "./runtime";
import * as schema from "./schema";
import type { AdlSqliteDatabase } from "./sqlite-types";

/**
 * Drizzle client over {@link schema}.
 *
 * The bun-sqlite and better-sqlite3 adapters construct different concrete
 * classes; `BaseSQLiteDatabase` is the driver-agnostic base both extend, so
 * typed and raw-SQL queries work without the caller knowing which runtime
 * opened the file.
 */
export type AdlDb = BaseSQLiteDatabase<"sync", unknown, typeof schema>;

/**
 * Wraps an already-open raw connection in its matching `drizzle-orm` adapter.
 *
 * Bun and better-sqlite3 need different `drizzle-orm` adapter packages even
 * though both produce a {@link AdlDb} — the same `isBunRuntime()` branch
 * `db/index.ts` uses to pick the raw driver is reused here to pick the
 * matching drizzle one, so there is exactly one place that knows how to tell
 * the two runtimes apart.
 */
export function wrapAdlDb(sqlite: AdlSqliteDatabase): AdlDb {
  if (isBunRuntime()) {
    const { drizzle } =
      require("drizzle-orm/bun-sqlite") as typeof import("drizzle-orm/bun-sqlite");
    return drizzle(sqlite as never, { schema });
  }
  const { drizzle } =
    require("drizzle-orm/better-sqlite3") as typeof import("drizzle-orm/better-sqlite3");
  return drizzle(sqlite as never, { schema });
}
