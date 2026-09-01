import { openAdlSqlite, resolveAdlSqlitePath } from "../db";

import type {
  RunEvent,
  RunEventOfType,
  RunEventType,
  StepRecord,
  StepSlot,
  WorkflowRunSummary,
} from "./events";
import type {
  AgentEpisodeSummary,
  ListEventsFilter,
  ListEventsScope,
  WorkflowStore,
} from "./workflow-store";
import type { SqliteStoreOptions } from "../stores/sqlite";

type EventRow = {
  payload_json: string;
};

type RunRow = {
  workflow_run_id: string;
  workflow_id: string;
  status: WorkflowRunSummary["status"];
  started_at: string;
  finished_at: string | null;
  title: string | null;
};

type TagRow = {
  workflow_run_id: string;
  tag: string;
};

function stepSlotKey(slot: StepSlot): string {
  const keyPart = slot.key ?? "";
  return `${slot.parentStepId ?? "root"}:${slot.name}:${keyPart}`;
}

/** `(?, ?, ...)` placeholder list for a dynamic-length `IN (...)` clause. */
function placeholders(count: number): string {
  return `(${Array(count).fill("?").join(", ")})`;
}

function fetchTagsByRunId(
  sqlite: ReturnType<typeof openAdlSqlite>,
  workflowRunIds: string[],
): Map<string, string[]> {
  const tagsByRun = new Map<string, string[]>();
  if (workflowRunIds.length === 0) {
    return tagsByRun;
  }
  const rows = sqlite
    .prepare(
      `SELECT workflow_run_id, tag FROM adl_workflow_run_tags WHERE workflow_run_id IN ${placeholders(workflowRunIds.length)}`,
    )
    .all(...workflowRunIds) as TagRow[];
  for (const row of rows) {
    const list = tagsByRun.get(row.workflow_run_id) ?? [];
    list.push(row.tag);
    tagsByRun.set(row.workflow_run_id, list);
  }
  return tagsByRun;
}

function applyEventFilter(events: RunEvent[], filter?: ListEventsFilter): RunEvent[] {
  let list = events;
  if (filter?.type) {
    const types = Array.isArray(filter.type) ? filter.type : [filter.type];
    list = list.filter((event) => types.includes(event.type));
  }
  if (filter?.afterSeq !== undefined) {
    const afterSeq = filter.afterSeq;
    list = list.filter((event) => event.runSeq > afterSeq);
  }
  if (filter?.limit !== undefined) {
    list = list.slice(0, filter.limit);
  }
  return list;
}

function materializeEvent(sqlite: ReturnType<typeof openAdlSqlite>, event: RunEvent): void {
  const workflowRunId = "workflowRunId" in event ? (event.workflowRunId ?? null) : null;
  const agentCallId = "agentCallId" in event ? event.agentCallId : null;

  sqlite
    .prepare(
      `INSERT INTO adl_workflow_events
        (workflow_run_id, agent_call_id, run_seq, type, at, event_schema_version, payload_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      workflowRunId,
      agentCallId,
      event.runSeq,
      event.type,
      event.at,
      event.eventSchemaVersion,
      JSON.stringify(event),
    );

  if (event.type === "workflow_started") {
    sqlite
      .prepare(
        `INSERT INTO adl_workflow_runs
          (workflow_run_id, workflow_id, status, started_at, finished_at, input_json, output_json)
         VALUES (?, ?, 'running', ?, NULL, ?, NULL)
         ON CONFLICT(workflow_run_id) DO UPDATE SET
           workflow_id = excluded.workflow_id,
           status = 'running',
           started_at = excluded.started_at,
           finished_at = NULL,
           input_json = excluded.input_json,
           output_json = NULL`,
      )
      .run(event.workflowRunId, event.workflowId, event.at, JSON.stringify(event.input));

    for (const tag of event.tags ?? []) {
      sqlite
        .prepare(`INSERT OR IGNORE INTO adl_workflow_run_tags (workflow_run_id, tag) VALUES (?, ?)`)
        .run(event.workflowRunId, tag);
    }
  }

  if (event.type === "workflow_finished") {
    sqlite
      .prepare(
        `UPDATE adl_workflow_runs SET status = 'ok', finished_at = ?, output_json = ? WHERE workflow_run_id = ?`,
      )
      .run(event.at, JSON.stringify(event.output), event.workflowRunId);
  }

  if (event.type === "workflow_failed") {
    sqlite
      .prepare(
        `UPDATE adl_workflow_runs SET status = 'error', finished_at = ? WHERE workflow_run_id = ?`,
      )
      .run(event.at, event.workflowRunId);
  }

  if (event.type === "workflow_cancelled") {
    sqlite
      .prepare(
        `UPDATE adl_workflow_runs SET status = 'cancelled', finished_at = ? WHERE workflow_run_id = ?`,
      )
      .run(event.at, event.workflowRunId);
  }

  if (event.type === "workflow_title_set") {
    sqlite
      .prepare(
        `INSERT INTO adl_workflow_runs (workflow_run_id, workflow_id, status, started_at, title)
         VALUES (?, '', 'running', ?, ?)
         ON CONFLICT(workflow_run_id) DO UPDATE SET title = excluded.title`,
      )
      .run(event.workflowRunId, event.at, event.title);
  }

  if (event.type === "step_finished") {
    const slot = stepSlotKey({
      parentStepId: event.parentStepId,
      name: event.name,
      key: event.key,
    });
    sqlite
      .prepare(
        `INSERT OR REPLACE INTO adl_step_outputs (workflow_run_id, slot_key, output_json) VALUES (?, ?, ?)`,
      )
      .run(event.workflowRunId, slot, JSON.stringify(event.output));
    sqlite
      .prepare(
        `INSERT OR REPLACE INTO adl_step_records
          (workflow_run_id, step_id, name, key, path_json, parent_step_id, output_json, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'ok')`,
      )
      .run(
        event.workflowRunId,
        event.stepId,
        event.name,
        event.key ?? null,
        JSON.stringify(event.path),
        event.parentStepId,
        JSON.stringify(event.output),
      );
  }

  if (event.type === "step_failed") {
    sqlite
      .prepare(
        `INSERT OR REPLACE INTO adl_step_records
          (workflow_run_id, step_id, name, key, path_json, parent_step_id, output_json, status)
         VALUES (?, ?, ?, ?, ?, ?, NULL, 'error')`,
      )
      .run(
        event.workflowRunId,
        event.stepId,
        event.name,
        event.key ?? null,
        JSON.stringify(event.path),
        event.parentStepId,
      );
  }
}

/**
 * Durable {@link WorkflowStore} backed by SQLite (`bun:sqlite` under Bun,
 * `better-sqlite3` under Node).
 * File is created automatically (default `.data/agent-dev-lab.sqlite`).
 */
export function sqliteWorkflowStore(options: SqliteStoreOptions = {}): WorkflowStore {
  const sqlite = openAdlSqlite(options.path ?? resolveAdlSqlitePath());

  return {
    async recordEvent(event) {
      materializeEvent(sqlite, event);
    },

    async listEvents(scope, filter) {
      const rows = (
        "workflowRunId" in scope
          ? sqlite
              .prepare(
                "SELECT payload_json FROM adl_workflow_events WHERE workflow_run_id = ? ORDER BY run_seq ASC",
              )
              .all(scope.workflowRunId)
          : sqlite
              .prepare(
                "SELECT payload_json FROM adl_workflow_events WHERE agent_call_id = ? ORDER BY run_seq ASC",
              )
              .all(scope.agentCallId)
      ) as EventRow[];
      const events = rows.map((row) => JSON.parse(row.payload_json) as RunEvent);
      return applyEventFilter(events, filter);
    },

    async getLatestEvent<T extends RunEventType>(
      scope: ListEventsScope,
      type: T,
    ): Promise<RunEventOfType<T> | null> {
      const list = await this.listEvents(scope, { type });
      const last = list.at(-1);
      return (last as RunEventOfType<T> | undefined) ?? null;
    },

    async getRun(workflowRunId) {
      const row = sqlite
        .prepare(
          `SELECT workflow_run_id, workflow_id, status, started_at, finished_at, title
           FROM adl_workflow_runs WHERE workflow_run_id = ?`,
        )
        .get(workflowRunId) as RunRow | undefined;
      if (!row) {
        return null;
      }
      const tags = fetchTagsByRunId(sqlite, [row.workflow_run_id]).get(row.workflow_run_id) ?? [];
      return toSummary(row, tags);
    },

    async listRuns(filter) {
      const conditions: string[] = [];
      const params: string[] = [];
      if (filter?.workflowId) {
        conditions.push("workflow_id = ?");
        params.push(filter.workflowId);
      }
      if (filter?.tags?.length) {
        conditions.push(
          `workflow_run_id IN (SELECT DISTINCT workflow_run_id FROM adl_workflow_run_tags WHERE tag IN ${placeholders(filter.tags.length)})`,
        );
        params.push(...filter.tags);
      }
      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      const rows = sqlite
        .prepare(
          `SELECT workflow_run_id, workflow_id, status, started_at, finished_at, title FROM adl_workflow_runs ${where} ORDER BY started_at ASC`,
        )
        .all(...params) as RunRow[];
      const tagsByRun = fetchTagsByRunId(
        sqlite,
        rows.map((row) => row.workflow_run_id),
      );
      const list = rows.map((row) => toSummary(row, tagsByRun.get(row.workflow_run_id) ?? []));
      if (filter?.limit) {
        return list.slice(-filter.limit);
      }
      return list;
    },

    async getRunInput(workflowRunId) {
      const row = sqlite
        .prepare("SELECT input_json FROM adl_workflow_runs WHERE workflow_run_id = ?")
        .get(workflowRunId) as { input_json: string | null } | undefined;
      if (!row?.input_json) {
        return null;
      }
      return JSON.parse(row.input_json) as unknown;
    },

    async getRunOutput(workflowRunId) {
      const row = sqlite
        .prepare("SELECT output_json FROM adl_workflow_runs WHERE workflow_run_id = ?")
        .get(workflowRunId) as { output_json: string | null } | undefined;
      if (!row?.output_json) {
        return null;
      }
      return JSON.parse(row.output_json) as unknown;
    },

    async getStepOutput(workflowRunId, slot) {
      const row = sqlite
        .prepare(
          "SELECT output_json FROM adl_step_outputs WHERE workflow_run_id = ? AND slot_key = ?",
        )
        .get(workflowRunId, stepSlotKey(slot)) as { output_json: string } | undefined;
      if (!row) {
        return null;
      }
      return JSON.parse(row.output_json) as unknown;
    },

    async getStepById(workflowRunId, stepId) {
      const row = sqlite
        .prepare(
          `SELECT step_id, name, key, path_json, parent_step_id, output_json, status
           FROM adl_step_records WHERE workflow_run_id = ? AND step_id = ?`,
        )
        .get(workflowRunId, stepId) as
        | {
            step_id: string;
            name: string;
            key: string | null;
            path_json: string;
            parent_step_id: string | null;
            output_json: string | null;
            status: StepRecord["status"];
          }
        | undefined;
      if (!row) {
        return null;
      }
      return {
        stepId: row.step_id,
        name: row.name,
        key: row.key ?? undefined,
        path: JSON.parse(row.path_json) as string[],
        parentStepId: row.parent_step_id,
        output: row.output_json ? (JSON.parse(row.output_json) as unknown) : undefined,
        status: row.status,
      };
    },

    async setRunTitle(workflowRunId, title) {
      sqlite
        .prepare(
          `INSERT INTO adl_workflow_runs (workflow_run_id, workflow_id, status, started_at, title)
           VALUES (?, '', 'running', ?, ?)
           ON CONFLICT(workflow_run_id) DO UPDATE SET title = excluded.title`,
        )
        .run(workflowRunId, new Date().toISOString(), title);
    },

    async setRunTags(workflowRunId, tags) {
      sqlite
        .prepare(`DELETE FROM adl_workflow_run_tags WHERE workflow_run_id = ?`)
        .run(workflowRunId);
      for (const tag of tags) {
        sqlite
          .prepare(
            `INSERT OR IGNORE INTO adl_workflow_run_tags (workflow_run_id, tag) VALUES (?, ?)`,
          )
          .run(workflowRunId, tag);
      }
    },

    async deleteRun(workflowRunId) {
      sqlite
        .prepare(`DELETE FROM adl_workflow_events WHERE workflow_run_id = ?`)
        .run(workflowRunId);
      sqlite.prepare(`DELETE FROM adl_step_outputs WHERE workflow_run_id = ?`).run(workflowRunId);
      sqlite.prepare(`DELETE FROM adl_step_records WHERE workflow_run_id = ?`).run(workflowRunId);
      sqlite
        .prepare(`DELETE FROM adl_workflow_run_tags WHERE workflow_run_id = ?`)
        .run(workflowRunId);
      sqlite.prepare(`DELETE FROM adl_workflow_runs WHERE workflow_run_id = ?`).run(workflowRunId);
    },

    async listAgentEpisodes(filter) {
      const rows = sqlite
        .prepare(
          `SELECT payload_json FROM adl_workflow_events
           WHERE type = 'agent_started' ORDER BY at DESC`,
        )
        .all() as EventRow[];
      const episodes: AgentEpisodeSummary[] = [];
      for (const row of rows) {
        const event = JSON.parse(row.payload_json) as RunEvent;
        if (event.type !== "agent_started") {
          continue;
        }
        if (filter?.agentId && event.agentId !== filter.agentId) {
          continue;
        }
        episodes.push({
          agentCallId: event.agentCallId,
          agentId: event.agentId,
          memoryScope: event.memoryScope,
          startedAt: event.at,
          workflowRunId: event.workflowRunId,
          stepId: event.stepId,
        });
      }
      if (filter?.limit !== undefined) {
        return episodes.slice(0, filter.limit);
      }
      return episodes;
    },
  };
}

function toSummary(row: RunRow, tags: string[]): WorkflowRunSummary {
  return {
    workflowRunId: row.workflow_run_id,
    workflowId: row.workflow_id,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at ?? undefined,
    title: row.title ?? undefined,
    tags,
  };
}
