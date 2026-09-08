import { and, asc, desc, eq, inArray } from "drizzle-orm";

import { createDb, resolveAdlSqlitePath } from "../db";
import { applyProjections, stepSlotKey } from "../db/projections";
import { runEvents, stepOutputs, stepRecords, workflowRuns, workflowRunTags } from "../db/schema";
import type { AdlDb } from "../db";

import type {
  RunEvent,
  RunEventOfType,
  RunEventType,
  StepRecord,
  WorkflowRunSummary,
} from "./events";
import type {
  AgentEpisodeSummary,
  ListEventsFilter,
  ListEventsScope,
  WorkflowStore,
} from "./workflow-store";
import type { SqliteStoreOptions } from "../stores/sqlite";

function fetchTagsByRunId(db: AdlDb, workflowRunIds: string[]): Map<string, string[]> {
  const tagsByRun = new Map<string, string[]>();
  if (workflowRunIds.length === 0) {
    return tagsByRun;
  }
  const rows = db
    .select({ workflowRunId: workflowRunTags.workflowRunId, tag: workflowRunTags.tag })
    .from(workflowRunTags)
    .where(inArray(workflowRunTags.workflowRunId, workflowRunIds))
    .all();
  for (const row of rows) {
    const list = tagsByRun.get(row.workflowRunId) ?? [];
    list.push(row.tag);
    tagsByRun.set(row.workflowRunId, list);
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

/**
 * Appends the event to the log, then updates the entity tables projected off it.
 *
 * The append is the durable write; {@link applyProjections} only maintains read
 * models, and lives in `db/projections` because the schema migration's backfill
 * replays retained events through that same function.
 */
function materializeEvent(db: AdlDb, event: RunEvent): void {
  const workflowRunId = "workflowRunId" in event ? (event.workflowRunId ?? null) : null;
  const agentCallId = "agentCallId" in event ? event.agentCallId : null;

  db.insert(runEvents)
    .values({
      workflowRunId,
      agentCallId,
      runSeq: event.runSeq,
      type: event.type,
      at: event.at,
      eventSchemaVersion: event.eventSchemaVersion,
      payloadJson: JSON.stringify(event),
    })
    .run();

  applyProjections(db, event);
}

/**
 * Durable {@link WorkflowStore} backed by SQLite (`bun:sqlite` under Bun,
 * `better-sqlite3` under Node).
 * File is created automatically (default `.data/agent-dev-lab.sqlite`).
 */
export function sqliteWorkflowStore(options: SqliteStoreOptions = {}): WorkflowStore {
  const db = createDb(options.path ?? resolveAdlSqlitePath());

  return {
    async recordEvent(event) {
      materializeEvent(db, event);
    },

    async listEvents(scope, filter) {
      const rows =
        "workflowRunId" in scope
          ? db
              .select({ payloadJson: runEvents.payloadJson })
              .from(runEvents)
              .where(eq(runEvents.workflowRunId, scope.workflowRunId))
              .orderBy(asc(runEvents.runSeq))
              .all()
          : db
              .select({ payloadJson: runEvents.payloadJson })
              .from(runEvents)
              .where(eq(runEvents.agentCallId, scope.agentCallId))
              .orderBy(asc(runEvents.runSeq))
              .all();
      const events = rows.map((row) => JSON.parse(row.payloadJson) as RunEvent);
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
      const row = db
        .select({
          workflowRunId: workflowRuns.workflowRunId,
          workflowId: workflowRuns.workflowId,
          status: workflowRuns.status,
          startedAt: workflowRuns.startedAt,
          finishedAt: workflowRuns.finishedAt,
          title: workflowRuns.title,
        })
        .from(workflowRuns)
        .where(eq(workflowRuns.workflowRunId, workflowRunId))
        .get();
      if (!row) {
        return null;
      }
      const tags = fetchTagsByRunId(db, [row.workflowRunId]).get(row.workflowRunId) ?? [];
      return toSummary(row, tags);
    },

    async listRuns(filter) {
      let tagMatchedRunIds: string[] | undefined;
      if (filter?.tags?.length) {
        tagMatchedRunIds = db
          .selectDistinct({ workflowRunId: workflowRunTags.workflowRunId })
          .from(workflowRunTags)
          .where(inArray(workflowRunTags.tag, filter.tags))
          .all()
          .map((row) => row.workflowRunId);
      }

      const conditions = [
        filter?.workflowId ? eq(workflowRuns.workflowId, filter.workflowId) : undefined,
        // inArray([]) compiles to a `false` predicate, matching "no run has any of these tags".
        tagMatchedRunIds ? inArray(workflowRuns.workflowRunId, tagMatchedRunIds) : undefined,
      ].filter((condition) => condition !== undefined);

      const rows = db
        .select({
          workflowRunId: workflowRuns.workflowRunId,
          workflowId: workflowRuns.workflowId,
          status: workflowRuns.status,
          startedAt: workflowRuns.startedAt,
          finishedAt: workflowRuns.finishedAt,
          title: workflowRuns.title,
        })
        .from(workflowRuns)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(asc(workflowRuns.startedAt))
        .all();
      const tagsByRun = fetchTagsByRunId(
        db,
        rows.map((row) => row.workflowRunId),
      );
      const list = rows.map((row) => toSummary(row, tagsByRun.get(row.workflowRunId) ?? []));
      if (filter?.limit) {
        return list.slice(-filter.limit);
      }
      return list;
    },

    async getRunInput(workflowRunId) {
      const row = db
        .select({ inputJson: workflowRuns.inputJson })
        .from(workflowRuns)
        .where(eq(workflowRuns.workflowRunId, workflowRunId))
        .get();
      if (!row?.inputJson) {
        return null;
      }
      return JSON.parse(row.inputJson) as unknown;
    },

    async getRunOutput(workflowRunId) {
      const row = db
        .select({ outputJson: workflowRuns.outputJson })
        .from(workflowRuns)
        .where(eq(workflowRuns.workflowRunId, workflowRunId))
        .get();
      if (!row?.outputJson) {
        return null;
      }
      return JSON.parse(row.outputJson) as unknown;
    },

    async getStepOutput(workflowRunId, slot) {
      const row = db
        .select({ outputJson: stepOutputs.outputJson })
        .from(stepOutputs)
        .where(
          and(
            eq(stepOutputs.workflowRunId, workflowRunId),
            eq(stepOutputs.slotKey, stepSlotKey(slot)),
          ),
        )
        .get();
      if (!row) {
        return null;
      }
      return JSON.parse(row.outputJson) as unknown;
    },

    async getStepById(workflowRunId, stepId) {
      const row = db
        .select()
        .from(stepRecords)
        .where(and(eq(stepRecords.workflowRunId, workflowRunId), eq(stepRecords.stepId, stepId)))
        .get();
      if (!row) {
        return null;
      }
      const record: StepRecord = {
        stepId: row.stepId,
        name: row.name,
        key: row.key ?? undefined,
        path: JSON.parse(row.pathJson) as string[],
        parentStepId: row.parentStepId,
        output: row.outputJson ? (JSON.parse(row.outputJson) as unknown) : undefined,
        status: row.status,
      };
      return record;
    },

    async setRunTitle(workflowRunId, title) {
      db.insert(workflowRuns)
        .values({
          workflowRunId,
          workflowId: "",
          status: "running",
          startedAt: new Date().toISOString(),
          title,
        })
        .onConflictDoUpdate({ target: workflowRuns.workflowRunId, set: { title } })
        .run();
    },

    async setRunTags(workflowRunId, tags) {
      db.delete(workflowRunTags).where(eq(workflowRunTags.workflowRunId, workflowRunId)).run();
      for (const tag of tags) {
        db.insert(workflowRunTags).values({ workflowRunId, tag }).onConflictDoNothing().run();
      }
    },

    async deleteRun(workflowRunId) {
      db.delete(runEvents).where(eq(runEvents.workflowRunId, workflowRunId)).run();
      db.delete(stepOutputs).where(eq(stepOutputs.workflowRunId, workflowRunId)).run();
      db.delete(stepRecords).where(eq(stepRecords.workflowRunId, workflowRunId)).run();
      db.delete(workflowRunTags).where(eq(workflowRunTags.workflowRunId, workflowRunId)).run();
      db.delete(workflowRuns).where(eq(workflowRuns.workflowRunId, workflowRunId)).run();
    },

    async listAgentEpisodes(filter) {
      const rows = db
        .select({ payloadJson: runEvents.payloadJson })
        .from(runEvents)
        .where(eq(runEvents.type, "agent_started"))
        .orderBy(desc(runEvents.at))
        .all();
      const episodes: AgentEpisodeSummary[] = [];
      for (const row of rows) {
        const event = JSON.parse(row.payloadJson) as RunEvent;
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

function toSummary(
  row: {
    workflowRunId: string;
    workflowId: string;
    status: WorkflowRunSummary["status"];
    startedAt: string;
    finishedAt: string | null;
    title: string | null;
  },
  tags: string[],
): WorkflowRunSummary {
  return {
    workflowRunId: row.workflowRunId,
    workflowId: row.workflowId,
    status: row.status,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt ?? undefined,
    title: row.title ?? undefined,
    tags,
  };
}
