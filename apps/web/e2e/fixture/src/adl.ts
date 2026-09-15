import path from "node:path";

import { createAdlRuntime, sqliteMessageStore, sqliteWorkflowStore } from "@agent-dev-lab/core";

function resolveFixtureSqlitePath(): string {
  const sqlitePath = process.env.ADL_SQLITE_PATH;
  if (!sqlitePath) {
    throw new Error(
      "e2e fixture requires ADL_SQLITE_PATH (Playwright webServer sets a temp sqlite file).",
    );
  }
  if (!path.isAbsolute(sqlitePath)) {
    throw new Error(`e2e fixture ADL_SQLITE_PATH must be absolute, got ${sqlitePath}`);
  }
  return sqlitePath;
}

const dbPath = resolveFixtureSqlitePath();

/**
 * Isolated inspection-UI target for Playwright. No live API keys, no
 * `@agent-dev-lab/tools` / bwrap. `version: false` so tags do not depend on
 * the ambient jj/git checkout.
 */
export const adl = createAdlRuntime({
  loadEnv: false,
  version: false,
  telemetry: { isEnabled: false },
  stores: {
    message: sqliteMessageStore({ path: dbPath }),
    workflow: sqliteWorkflowStore({ path: dbPath }),
  },
});
