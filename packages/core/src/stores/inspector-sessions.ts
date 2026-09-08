import { desc, eq, isNotNull, isNull } from "drizzle-orm";

import { createDb, resolveAdlSqlitePath } from "../db";
import { inspectorSessions } from "../db/schema";

import type { SqliteStoreOptions } from "./sqlite";

export type InspectorSessionFork = {
  sourceWorkflowId: string;
  sourceWorkflowRunId: string;
  sourceStepId: string;
  sourceAgentCallId: string;
  sourceMemoryScope: string;
};

export type InspectorSessionRecord = {
  memoryScope: string;
  agentId: string;
  agentCallId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  fork?: InspectorSessionFork;
  deletedAt?: string;
};

type SessionRow = typeof inspectorSessions.$inferSelect;

function rowToRecord(row: SessionRow): InspectorSessionRecord {
  return {
    memoryScope: row.memoryScope,
    agentId: row.agentId,
    agentCallId: row.agentCallId,
    title: row.title,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    fork: row.forkJson ? (JSON.parse(row.forkJson) as InspectorSessionFork) : undefined,
    deletedAt: row.deletedAt ?? undefined,
  };
}

/** Persists inspection-UI chat sessions alongside workflow/message stores. */
export function sqliteInspectorSessionStore(options: SqliteStoreOptions = {}) {
  const db = createDb(options.path ?? resolveAdlSqlitePath());

  return {
    upsert(record: InspectorSessionRecord): void {
      const values = {
        memoryScope: record.memoryScope,
        agentId: record.agentId,
        agentCallId: record.agentCallId,
        title: record.title,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        forkJson: record.fork ? JSON.stringify(record.fork) : null,
        deletedAt: record.deletedAt ?? null,
      };
      db.insert(inspectorSessions)
        .values(values)
        .onConflictDoUpdate({ target: inspectorSessions.memoryScope, set: values })
        .run();
    },

    list(): InspectorSessionRecord[] {
      const rows = db
        .select()
        .from(inspectorSessions)
        .where(isNull(inspectorSessions.deletedAt))
        .orderBy(desc(inspectorSessions.updatedAt))
        .all();
      return rows.map(rowToRecord);
    },

    listDeletedScopes(): string[] {
      const rows = db
        .select({ memoryScope: inspectorSessions.memoryScope })
        .from(inspectorSessions)
        .where(isNotNull(inspectorSessions.deletedAt))
        .all();
      return rows.map((row) => row.memoryScope);
    },

    get(memoryScope: string): InspectorSessionRecord | undefined {
      const row = db
        .select()
        .from(inspectorSessions)
        .where(eq(inspectorSessions.memoryScope, memoryScope))
        .get();
      return row ? rowToRecord(row) : undefined;
    },
  };
}
