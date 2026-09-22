import { desc, eq } from "drizzle-orm";
import type { ModelMessage } from "ai";

import { createDb, resolveAdlSqlitePath } from "../db";
import { messages } from "../db/schema";
import { AdlError } from "../errors";

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
  const db = createDb(options.path ?? resolveAdlSqlitePath());

  return {
    kind: "sqlite",
    async load(memoryScope) {
      const row = db
        .select({ messagesJson: messages.messagesJson })
        .from(messages)
        .where(eq(messages.memoryScope, memoryScope))
        .get();
      if (!row) {
        return [];
      }
      return JSON.parse(row.messagesJson) as ModelMessage[];
    },
    async save(memoryScope, transcript) {
      const updatedAt = new Date().toISOString();
      db.insert(messages)
        .values({ memoryScope, messagesJson: JSON.stringify(transcript), updatedAt })
        .onConflictDoUpdate({
          target: messages.memoryScope,
          set: { messagesJson: JSON.stringify(transcript), updatedAt },
        })
        .run();
    },
    async copy(fromScope, toScope) {
      if (fromScope === toScope) {
        return;
      }
      const source = db
        .select({ messagesJson: messages.messagesJson })
        .from(messages)
        .where(eq(messages.memoryScope, fromScope))
        .get();
      if (!source) {
        throw new AdlError("INVALID_INPUT", `MessageStore.copy: no transcript for "${fromScope}"`);
      }
      const destination = db
        .select({ memoryScope: messages.memoryScope })
        .from(messages)
        .where(eq(messages.memoryScope, toScope))
        .get();
      if (destination) {
        throw new AdlError(
          "INVALID_INPUT",
          `MessageStore.copy: "${toScope}" already has a transcript`,
        );
      }
      db.insert(messages)
        .values({
          memoryScope: toScope,
          messagesJson: source.messagesJson,
          updatedAt: new Date().toISOString(),
        })
        .run();
    },
    async delete(memoryScope) {
      db.delete(messages).where(eq(messages.memoryScope, memoryScope)).run();
    },
    async listScopes() {
      const rows = db
        .select({ memoryScope: messages.memoryScope })
        .from(messages)
        .orderBy(desc(messages.updatedAt))
        .all();
      return rows.map((row) => row.memoryScope);
    },
  };
}
