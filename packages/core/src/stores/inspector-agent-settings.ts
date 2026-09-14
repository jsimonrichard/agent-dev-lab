import { eq } from "drizzle-orm";

import { createDb, resolveAdlSqlitePath } from "../db";
import { inspectorAgentSettings } from "../db/schema";

import type { SqliteStoreOptions } from "./sqlite";

/**
 * Inspection-UI defaults for one registered agent. Never read by `agent.run` —
 * only hosts that seed a new conversation's tool-context draft use this.
 */
export type InspectorAgentSettingsRecord = {
  agentId: string;
  /** Absent when the inspector has no saved default for this agent. */
  defaultToolProviderContext?: unknown;
  updatedAt: string;
};

/**
 * Persists inspector-only per-agent settings alongside the other ADL SQLite
 * tables. The runtime does not consult this store.
 */
export function sqliteInspectorAgentSettingsStore(options: SqliteStoreOptions = {}) {
  const db = createDb(options.path ?? resolveAdlSqlitePath());

  return {
    get(agentId: string): InspectorAgentSettingsRecord | undefined {
      const row = db
        .select()
        .from(inspectorAgentSettings)
        .where(eq(inspectorAgentSettings.agentId, agentId))
        .get();
      if (!row) {
        return undefined;
      }
      return {
        agentId: row.agentId,
        updatedAt: row.updatedAt,
        ...(row.defaultToolProviderContextJson !== null
          ? {
              defaultToolProviderContext: JSON.parse(row.defaultToolProviderContextJson) as unknown,
            }
          : {}),
      };
    },

    /**
     * Upserts the default. Pass `undefined` for `defaultToolProviderContext` to
     * clear it (row remains with a null JSON column).
     */
    set(agentId: string, defaultToolProviderContext: unknown | undefined): void {
      const updatedAt = new Date().toISOString();
      const values = {
        agentId,
        defaultToolProviderContextJson:
          defaultToolProviderContext !== undefined
            ? JSON.stringify(defaultToolProviderContext)
            : null,
        updatedAt,
      };
      db.insert(inspectorAgentSettings)
        .values(values)
        .onConflictDoUpdate({ target: inspectorAgentSettings.agentId, set: values })
        .run();
    },

    list(): InspectorAgentSettingsRecord[] {
      return db
        .select()
        .from(inspectorAgentSettings)
        .all()
        .map((row) => ({
          agentId: row.agentId,
          updatedAt: row.updatedAt,
          ...(row.defaultToolProviderContextJson !== null
            ? {
                defaultToolProviderContext: JSON.parse(
                  row.defaultToolProviderContextJson,
                ) as unknown,
              }
            : {}),
        }));
    },
  };
}
