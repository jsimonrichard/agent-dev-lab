import { openAdlSqlite, resolveAdlSqlitePath } from "@agent-dev-lab/common";
import type { CoreMessage } from "ai";

import type { MessageStore } from "./types";

export type SqliteStoreOptions = {
  /** Absolute path or project-relative path. Defaults to {@link resolveAdlSqlitePath}. */
  path?: string;
};

/**
 * Durable {@link MessageStore} backed by SQLite (`bun:sqlite` under Bun,
 * `better-sqlite3` under Node). File is created automatically (default
 * `.data/agent-dev-lab.sqlite`).
 */
export function sqliteMessageStore(options: SqliteStoreOptions = {}): MessageStore {
  const sqlite = openAdlSqlite(options.path ?? resolveAdlSqlitePath());

  return {
    kind: "sqlite",
    async load(memoryScope) {
      const row = sqlite
        .prepare("SELECT messages_json FROM adl_messages WHERE memory_scope = ?")
        .get(memoryScope) as { messages_json: string } | undefined;
      if (!row) {
        return [];
      }
      return JSON.parse(row.messages_json) as CoreMessage[];
    },
    async save(memoryScope, messages) {
      sqlite
        .prepare(
          "INSERT OR REPLACE INTO adl_messages (memory_scope, messages_json, updated_at) VALUES (?, ?, ?)",
        )
        .run(memoryScope, JSON.stringify(messages), new Date().toISOString());
    },
    async delete(memoryScope) {
      sqlite.prepare("DELETE FROM adl_messages WHERE memory_scope = ?").run(memoryScope);
    },
    async listScopes() {
      const rows = sqlite
        .prepare("SELECT memory_scope FROM adl_messages ORDER BY updated_at DESC")
        .all() as { memory_scope: string }[];
      return rows.map((row) => row.memory_scope);
    },
  };
}
