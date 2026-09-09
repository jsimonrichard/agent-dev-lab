import { createRequire } from "node:module";

/**
 * Native SQLite / Drizzle adapters are dependencies of this package. When a
 * module in this package is bundled into another app's SSR output (e.g.
 * inspection UI `.output`), `import.meta.url` points at the chunk and cannot
 * resolve those deps — anchor `require` at the installed `@agent-dev-lab/core`
 * entry instead.
 *
 * Shared by `db/index.ts` (raw driver: `bun:sqlite` / `better-sqlite3`) and
 * `db/wrap-drizzle.ts` (the matching `drizzle-orm` adapter) — same resolution
 * problem, same fix, one definition. All three files live in this directory,
 * so `import.meta.url` resolves bare specifiers identically regardless of
 * which of them it's read from.
 */
function createPackageRequire(): NodeJS.Require {
  const fromThisFile = createRequire(import.meta.url);
  try {
    return createRequire(fromThisFile.resolve("@agent-dev-lab/core"));
  } catch {
    return fromThisFile;
  }
}

export const packageRequire: NodeJS.Require = createPackageRequire();

/**
 * - **Bun:** `bun:sqlite` (native addon of better-sqlite3 is unreliable under Bun)
 * - **Node 22+:** `better-sqlite3` (no Bun relaunch required for `adl`)
 */
export function isBunRuntime(): boolean {
  return typeof (globalThis as { Bun?: unknown }).Bun !== "undefined";
}
