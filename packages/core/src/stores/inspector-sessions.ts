import { openAdlSqlite, resolveAdlSqlitePath } from "../db";

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

type SessionRow = {
  memory_scope: string;
  agent_id: string;
  agent_call_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  fork_json: string | null;
  deleted_at: string | null;
};

function rowToRecord(row: SessionRow): InspectorSessionRecord {
  return {
    memoryScope: row.memory_scope,
    agentId: row.agent_id,
    agentCallId: row.agent_call_id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    fork: row.fork_json ? (JSON.parse(row.fork_json) as InspectorSessionFork) : undefined,
    deletedAt: row.deleted_at ?? undefined,
  };
}

/** Persists inspection-UI chat sessions alongside workflow/message stores. */
export function sqliteInspectorSessionStore(options: SqliteStoreOptions = {}) {
  const sqlite = openAdlSqlite(options.path ?? resolveAdlSqlitePath());

  return {
    upsert(record: InspectorSessionRecord): void {
      sqlite
        .prepare(
          `INSERT OR REPLACE INTO adl_inspector_sessions
            (memory_scope, agent_id, agent_call_id, title, created_at, updated_at, fork_json, deleted_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          record.memoryScope,
          record.agentId,
          record.agentCallId,
          record.title,
          record.createdAt,
          record.updatedAt,
          record.fork ? JSON.stringify(record.fork) : null,
          record.deletedAt ?? null,
        );
    },

    list(): InspectorSessionRecord[] {
      const rows = sqlite
        .prepare(
          `SELECT memory_scope, agent_id, agent_call_id, title, created_at, updated_at, fork_json, deleted_at
           FROM adl_inspector_sessions
           WHERE deleted_at IS NULL
           ORDER BY updated_at DESC`,
        )
        .all() as SessionRow[];
      return rows.map(rowToRecord);
    },

    listDeletedScopes(): string[] {
      const rows = sqlite
        .prepare(`SELECT memory_scope FROM adl_inspector_sessions WHERE deleted_at IS NOT NULL`)
        .all() as { memory_scope: string }[];
      return rows.map((row) => row.memory_scope);
    },

    get(memoryScope: string): InspectorSessionRecord | undefined {
      const row = sqlite
        .prepare(
          `SELECT memory_scope, agent_id, agent_call_id, title, created_at, updated_at, fork_json, deleted_at
           FROM adl_inspector_sessions WHERE memory_scope = ?`,
        )
        .get(memoryScope) as SessionRow | undefined;
      return row ? rowToRecord(row) : undefined;
    },
  };
}
