import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createAdlRuntime,
  resolveAdlSqlitePath,
  sqliteMessageStore,
  sqliteWorkflowStore,
} from "@agent-dev-lab/core";

import { model } from "./model";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dbPath = resolveAdlSqlitePath(projectRoot);

/**
 * Project runtime — stores and the default model.
 * Referenced from `adl.config.ts` as `config.adl`; registry code imports via `#adl`.
 *
 * `.env*` is loaded by {@link createAdlRuntime} (default) and by `src/model.ts` via
 * {@link import("@agent-dev-lab/core").loadAdlEnv} so `ADL_MODEL` is set before the model id is read.
 */
export const adl = createAdlRuntime({
  loadEnv: { root: projectRoot },
  defaults: {
    model,
  },
  stores: {
    message: sqliteMessageStore({ path: dbPath }),
    workflow: sqliteWorkflowStore({ path: dbPath }),
  },
});
