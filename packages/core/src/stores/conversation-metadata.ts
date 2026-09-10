import { desc, eq, isNotNull, isNull } from "drizzle-orm";

import { createDb, resolveAdlSqlitePath } from "../db";
import { conversationMetadata } from "../db/schema";

import type { SqliteStoreOptions } from "./sqlite";

export type ConversationFork = {
  sourceWorkflowId: string;
  sourceWorkflowRunId: string;
  sourceStepId: string;
  sourceAgentCallId: string;
  sourceMemoryScope: string;
};

export type ConversationMetadataRecord = {
  memoryScope: string;
  agentId: string;
  /** Absent until the conversation's first episode exists (a fork predates its first turn). */
  agentCallId?: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  fork?: ConversationFork;
  deletedAt?: string;
};

type ConversationMetadataRow = typeof conversationMetadata.$inferSelect;

function rowToRecord(row: ConversationMetadataRow): ConversationMetadataRecord {
  return {
    memoryScope: row.memoryScope,
    agentId: row.agentId,
    agentCallId: row.agentCallId ?? undefined,
    title: row.title,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    fork: row.forkJson ? (JSON.parse(row.forkJson) as ConversationFork) : undefined,
    deletedAt: row.deletedAt ?? undefined,
  };
}

/**
 * Metadata about a conversation — not the source of truth for message
 * content (that's {@link sqliteMessageStore}). Persists alongside the
 * workflow/message stores.
 */
export function sqliteConversationMetadataStore(options: SqliteStoreOptions = {}) {
  const db = createDb(options.path ?? resolveAdlSqlitePath());

  return {
    upsert(record: ConversationMetadataRecord): void {
      const values = {
        memoryScope: record.memoryScope,
        agentId: record.agentId,
        agentCallId: record.agentCallId ?? null,
        title: record.title,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        forkJson: record.fork ? JSON.stringify(record.fork) : null,
        deletedAt: record.deletedAt ?? null,
      };
      db.insert(conversationMetadata)
        .values(values)
        .onConflictDoUpdate({ target: conversationMetadata.memoryScope, set: values })
        .run();
    },

    list(): ConversationMetadataRecord[] {
      const rows = db
        .select()
        .from(conversationMetadata)
        .where(isNull(conversationMetadata.deletedAt))
        .orderBy(desc(conversationMetadata.updatedAt))
        .all();
      return rows.map(rowToRecord);
    },

    listDeletedScopes(): string[] {
      const rows = db
        .select({ memoryScope: conversationMetadata.memoryScope })
        .from(conversationMetadata)
        .where(isNotNull(conversationMetadata.deletedAt))
        .all();
      return rows.map((row) => row.memoryScope);
    },

    get(memoryScope: string): ConversationMetadataRecord | undefined {
      const row = db
        .select()
        .from(conversationMetadata)
        .where(eq(conversationMetadata.memoryScope, memoryScope))
        .get();
      return row ? rowToRecord(row) : undefined;
    },
  };
}
