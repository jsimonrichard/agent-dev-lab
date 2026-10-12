import { and, asc, desc, eq, inArray, isNull, max } from "drizzle-orm";

import { createDb, resolveAdlSqlitePath } from "../db";
import { applyProjections, stepSlotKey } from "../db/projections";
import {
  decodeMemoryScopes,
  decodeMemorySnapshots,
  encodeMemoryScopes,
  encodeMemorySnapshots,
} from "../db/projections/step-records";
import {
  agentEpisodes,
  runEvents,
  stepOutputs,
  stepRecords,
  suspends,
  workflowRuns,
  workflowRunTags,
} from "../db/schema";
import type { AdlDb } from "../db";

import type {
  RunEvent,
  RunEventOfType,
  RunEventType,
  StepRecord,
  WorkflowRunSummary,
} from "../observability/events";
import { isLiveWorkflowRunStatus } from "../observability/events";
import type {
  AgentEpisodeSummary,
  ListEventsFilter,
  ListEventsScope,
  WorkflowStore,
} from "./workflow-store";
import {
  LIVE_RUN_CLOSED_DENY,
  type EffectIntent,
  type SuspendHandle,
  type SuspendRecord,
  type SuspendResolveDecision,
} from "../effect/types";
import {
  alreadyResolvedSuspendError,
  missingSuspendError,
  pendingSuspendConflictError,
  SuspendWaiterHub,
  terminalRunSuspendError,
  unknownRunForSuspendError,
  waitForRecordResolution,
} from "./suspend-waiters";
import {
  assertSuspendResolveDecision,
  workflowResumedEvent,
  workflowSuspendedEvent,
} from "./suspend-records";
import { toTokenUsage } from "../observability/token-usage";
import type { SqliteStoreOptions } from "../stores/sqlite";
import type {
  AttemptRunMaterialization,
  AttemptStepMaterialization,
} from "../workflow/retry-attempt";
import { seedRetryAttemptOnStore, seedRetryFromCursorOnStore } from "../workflow/retry-attempt";

function fetchPendingSuspendsByRunId(
  db: AdlDb,
  workflowRunIds: string[],
): Map<string, SuspendRecord> {
  const byRun = new Map<string, SuspendRecord>();
  if (workflowRunIds.length === 0) {
    return byRun;
  }
  const rows = db
    .select()
    .from(suspends)
    .where(and(inArray(suspends.workflowRunId, workflowRunIds), eq(suspends.status, "pending")))
    .all();
  for (const row of rows) {
    byRun.set(row.workflowRunId, rowToSuspendRecord(row));
  }
  return byRun;
}

function nextWorkflowRunSeq(db: AdlDb, workflowRunId: string): number {
  const row = db
    .select({ maxSeq: max(runEvents.runSeq) })
    .from(runEvents)
    .where(eq(runEvents.workflowRunId, workflowRunId))
    .get();
  return (row?.maxSeq ?? 0) + 1;
}

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

/** Maps a {@link ListEventsScope} to the log column that addresses it. */
function scopeCondition(scope: ListEventsScope) {
  if ("workflowRunId" in scope) {
    return eq(runEvents.workflowRunId, scope.workflowRunId);
  }
  if ("agentCallId" in scope) {
    return eq(runEvents.agentCallId, scope.agentCallId);
  }
  return eq(runEvents.memoryScope, scope.memoryScope);
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
  // Only conversation-scoped events get addressed by memory_scope — see the
  // column's note in db/schema.ts for why run-scoped events must not, even
  // though several of them also carry a memoryScope field.
  const memoryScope = event.type === "conversation_forked" ? event.memoryScope : null;

  db.insert(runEvents)
    .values({
      workflowRunId,
      agentCallId,
      memoryScope,
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
  const waiters = new SuspendWaiterHub();

  return {
    async recordEvent(event) {
      const workflowRunId =
        "workflowRunId" in event && event.workflowRunId ? event.workflowRunId : null;
      const pendingHandleIds =
        workflowRunId &&
        (event.type === "workflow_finished" ||
          event.type === "workflow_failed" ||
          event.type === "workflow_cancelled")
          ? db
              .select({ handleId: suspends.handleId })
              .from(suspends)
              .where(and(eq(suspends.workflowRunId, workflowRunId), eq(suspends.status, "pending")))
              .all()
              .map((row) => row.handleId)
          : [];
      materializeEvent(db, event);
      for (const handleId of pendingHandleIds) {
        waiters.settle(handleId, LIVE_RUN_CLOSED_DENY);
      }
    },

    async listEvents(scope, filter) {
      const rows = db
        .select({ payloadJson: runEvents.payloadJson })
        .from(runEvents)
        .where(scopeCondition(scope))
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
          parentWorkflowRunId: workflowRuns.parentWorkflowRunId,
          parentStepId: workflowRuns.parentStepId,
          retriesFromRunId: workflowRuns.retriesFromRunId,
          replayOfRunId: workflowRuns.replayOfRunId,
        })
        .from(workflowRuns)
        .where(eq(workflowRuns.workflowRunId, workflowRunId))
        .get();
      if (!row) {
        return null;
      }
      const tags = fetchTagsByRunId(db, [row.workflowRunId]).get(row.workflowRunId) ?? [];
      const pending = fetchPendingSuspendsByRunId(db, [row.workflowRunId]).get(row.workflowRunId);
      return toSummary(row, tags, pending);
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
        filter?.rootsOnly
          ? isNull(workflowRuns.parentWorkflowRunId)
          : filter?.parentWorkflowRunId !== undefined
            ? eq(workflowRuns.parentWorkflowRunId, filter.parentWorkflowRunId)
            : undefined,
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
          parentWorkflowRunId: workflowRuns.parentWorkflowRunId,
          parentStepId: workflowRuns.parentStepId,
          retriesFromRunId: workflowRuns.retriesFromRunId,
          replayOfRunId: workflowRuns.replayOfRunId,
        })
        .from(workflowRuns)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(asc(workflowRuns.startedAt))
        .all();
      const tagsByRun = fetchTagsByRunId(
        db,
        rows.map((row) => row.workflowRunId),
      );
      const pendingByRun = fetchPendingSuspendsByRunId(
        db,
        rows.map((row) => row.workflowRunId),
      );
      const list = rows.map((row) =>
        toSummary(row, tagsByRun.get(row.workflowRunId) ?? [], pendingByRun.get(row.workflowRunId)),
      );
      if (filter?.limit) {
        return list.slice(-filter.limit);
      }
      return list;
    },

    async listDescendantRuns(workflowRunId) {
      const descendants: WorkflowRunSummary[] = [];
      const queue = [workflowRunId];
      const seen = new Set<string>([workflowRunId]);
      while (queue.length > 0) {
        const parentId = queue.shift()!;
        for (const child of await this.listRuns({ parentWorkflowRunId: parentId })) {
          if (seen.has(child.workflowRunId)) {
            continue;
          }
          seen.add(child.workflowRunId);
          descendants.push(child);
          queue.push(child.workflowRunId);
        }
      }
      return descendants;
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
      return rowToStepRecord(row);
    },

    async listStepRecords(workflowRunId) {
      const rows = db
        .select()
        .from(stepRecords)
        .where(eq(stepRecords.workflowRunId, workflowRunId))
        .all();
      return rows.map((row) => rowToStepRecord(row));
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
      const pending = db
        .select({ handleId: suspends.handleId })
        .from(suspends)
        .where(eq(suspends.workflowRunId, workflowRunId))
        .all();
      waiters.failAll(
        pending.map((row) => row.handleId),
        new Error(`Suspend handle was deleted with run "${workflowRunId}"`),
      );
      db.delete(suspends).where(eq(suspends.workflowRunId, workflowRunId)).run();
      db.delete(runEvents).where(eq(runEvents.workflowRunId, workflowRunId)).run();
      db.delete(stepOutputs).where(eq(stepOutputs.workflowRunId, workflowRunId)).run();
      db.delete(stepRecords).where(eq(stepRecords.workflowRunId, workflowRunId)).run();
      db.delete(workflowRunTags).where(eq(workflowRunTags.workflowRunId, workflowRunId)).run();
      db.delete(workflowRuns).where(eq(workflowRuns.workflowRunId, workflowRunId)).run();
    },

    async listAgentEpisodes(filter) {
      const query = db
        .select()
        .from(agentEpisodes)
        .where(filter?.agentId ? eq(agentEpisodes.agentId, filter.agentId) : undefined)
        .orderBy(desc(agentEpisodes.startedAt));
      const rows = (filter?.limit !== undefined ? query.limit(filter.limit) : query).all();
      return rows.map(toEpisodeSummary);
    },

    seedRetryFromCursor(args) {
      return seedRetryFromCursorOnStore(this, args);
    },

    seedRetryAttempt(args) {
      return seedRetryAttemptOnStore(this, args);
    },

    async materializeAttemptRun(run: AttemptRunMaterialization) {
      db.insert(workflowRuns)
        .values({
          workflowRunId: run.workflowRunId,
          workflowId: run.workflowId,
          status: run.status,
          startedAt: run.startedAt,
          finishedAt: run.finishedAt ?? null,
          inputJson: run.input !== undefined ? JSON.stringify(run.input) : null,
          outputJson: run.output !== undefined ? JSON.stringify(run.output) : null,
          title: run.title ?? null,
          parentWorkflowRunId: run.parentWorkflowRunId ?? null,
          parentStepId: run.parentStepId ?? null,
          retriesFromRunId: run.retriesFromRunId ?? null,
          replayOfRunId: run.replayOfRunId ?? null,
        })
        .onConflictDoUpdate({
          target: workflowRuns.workflowRunId,
          set: {
            workflowId: run.workflowId,
            status: run.status,
            startedAt: run.startedAt,
            finishedAt: run.finishedAt ?? null,
            inputJson: run.input !== undefined ? JSON.stringify(run.input) : null,
            outputJson: run.output !== undefined ? JSON.stringify(run.output) : null,
            title: run.title ?? null,
            parentWorkflowRunId: run.parentWorkflowRunId ?? null,
            parentStepId: run.parentStepId ?? null,
            retriesFromRunId: run.retriesFromRunId ?? null,
            replayOfRunId: run.replayOfRunId ?? null,
          },
        })
        .run();
      for (const tag of run.tags) {
        db.insert(workflowRunTags)
          .values({ workflowRunId: run.workflowRunId, tag })
          .onConflictDoNothing()
          .run();
      }
    },

    async materializeAttemptStep(step: AttemptStepMaterialization) {
      const pathJson = JSON.stringify(step.path);
      const outputJson = step.output !== undefined ? JSON.stringify(step.output) : null;
      const pure = step.pure === false ? 0 : 1;
      const memoryScopesJson = encodeMemoryScopes(step.memoryScopes);
      const memorySnapshotsJson = encodeMemorySnapshots(step.memorySnapshots);
      db.insert(stepRecords)
        .values({
          workflowRunId: step.workflowRunId,
          stepId: step.stepId,
          name: step.name,
          key: step.key ?? null,
          pathJson,
          parentStepId: step.parentStepId,
          outputJson,
          status: step.status,
          pure,
          replayOfStepId: step.replayOfStepId ?? null,
          memoryScopesJson,
          memorySnapshotsJson,
        })
        .onConflictDoUpdate({
          target: [stepRecords.workflowRunId, stepRecords.stepId],
          set: {
            name: step.name,
            key: step.key ?? null,
            pathJson,
            parentStepId: step.parentStepId,
            outputJson,
            status: step.status,
            pure,
            replayOfStepId: step.replayOfStepId ?? null,
            memoryScopesJson,
            memorySnapshotsJson,
          },
        })
        .run();
      if (step.status === "ok" && step.output !== undefined) {
        const slotKey = stepSlotKey({ path: step.path });
        const out = JSON.stringify(step.output);
        db.insert(stepOutputs)
          .values({ workflowRunId: step.workflowRunId, slotKey, outputJson: out })
          .onConflictDoUpdate({
            target: [stepOutputs.workflowRunId, stepOutputs.slotKey],
            set: { outputJson: out },
          })
          .run();
      }
    },

    async createSuspend(args: { handle: SuspendHandle; intent: EffectIntent }) {
      const run = await this.getRun(args.handle.workflowRunId);
      if (!run) {
        throw unknownRunForSuspendError(args.handle.workflowRunId);
      }
      const existingHandle = db
        .select({ handleId: suspends.handleId })
        .from(suspends)
        .where(eq(suspends.handleId, args.handle.id))
        .get();
      if (existingHandle) {
        throw pendingSuspendConflictError(args.handle.workflowRunId);
      }
      const pending = db
        .select({ handleId: suspends.handleId })
        .from(suspends)
        .where(
          and(
            eq(suspends.workflowRunId, args.handle.workflowRunId),
            eq(suspends.status, "pending"),
          ),
        )
        .get();
      if (pending) {
        throw pendingSuspendConflictError(args.handle.workflowRunId);
      }
      const runSeq = nextWorkflowRunSeq(db, args.handle.workflowRunId);
      materializeEvent(
        db,
        workflowSuspendedEvent({ handle: args.handle, intent: args.intent, runSeq }),
      );
    },

    async getSuspend(handleId) {
      const row = db.select().from(suspends).where(eq(suspends.handleId, handleId)).get();
      return row ? rowToSuspendRecord(row) : null;
    },

    async listPendingSuspends(filter) {
      const conditions = [
        eq(suspends.status, "pending"),
        filter?.workflowRunId ? eq(suspends.workflowRunId, filter.workflowRunId) : undefined,
      ].filter((condition) => condition !== undefined);
      const rows = db
        .select()
        .from(suspends)
        .where(and(...conditions))
        .all();
      return rows.map(rowToSuspendRecord);
    },

    async resolveSuspend(handleId, decision) {
      assertSuspendResolveDecision(decision);
      const record = await this.getSuspend(handleId);
      if (!record) {
        throw missingSuspendError(handleId);
      }
      if (record.status === "resolved") {
        throw alreadyResolvedSuspendError(handleId);
      }
      const run = await this.getRun(record.handle.workflowRunId);
      if (!run) {
        throw unknownRunForSuspendError(record.handle.workflowRunId);
      }
      if (!isLiveWorkflowRunStatus(run.status)) {
        throw terminalRunSuspendError(record.handle.workflowRunId, run.status);
      }
      const runSeq = nextWorkflowRunSeq(db, record.handle.workflowRunId);
      materializeEvent(
        db,
        workflowResumedEvent({
          workflowRunId: record.handle.workflowRunId,
          handleId,
          decision,
          runSeq,
        }),
      );
      waiters.settle(handleId, decision);
    },

    waitForSuspendResolution(handleId) {
      return waitForRecordResolution(waiters, handleId, () => this.getSuspend(handleId));
    },
  };
}

function toEpisodeSummary(row: typeof agentEpisodes.$inferSelect): AgentEpisodeSummary {
  const usage = toTokenUsage({
    inputTokens: row.inputTokens ?? undefined,
    outputTokens: row.outputTokens ?? undefined,
    totalTokens: row.totalTokens ?? undefined,
    cachedInputTokens: row.cachedInputTokens ?? undefined,
    reasoningTokens: row.reasoningTokens ?? undefined,
  });
  return {
    agentCallId: row.agentCallId,
    agentId: row.agentId,
    memoryScope: row.memoryScope,
    workflowRunId: row.workflowRunId ?? undefined,
    stepId: row.stepId ?? undefined,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt ?? undefined,
    status: row.status,
    modelId: row.modelId ?? undefined,
    modelProvider: row.modelProvider ?? undefined,
    ...(row.toolProviderContextJson !== null
      ? { toolProviderContext: JSON.parse(row.toolProviderContextJson) as unknown }
      : {}),
    ...(usage ? { usage } : {}),
  };
}

function rowToStepRecord(row: typeof stepRecords.$inferSelect): StepRecord {
  return {
    stepId: row.stepId,
    name: row.name,
    key: row.key ?? undefined,
    path: JSON.parse(row.pathJson) as string[],
    parentStepId: row.parentStepId,
    output: row.outputJson ? (JSON.parse(row.outputJson) as unknown) : undefined,
    status: row.status,
    pure: row.pure === 0 ? false : true,
    replayOfStepId: row.replayOfStepId,
    memoryScopes: decodeMemoryScopes(row.memoryScopesJson),
    memorySnapshots: decodeMemorySnapshots(row.memorySnapshotsJson),
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
    parentWorkflowRunId: string | null;
    parentStepId: string | null;
    retriesFromRunId: string | null;
    replayOfRunId: string | null;
  },
  tags: string[],
  pending?: SuspendRecord,
): WorkflowRunSummary {
  return {
    workflowRunId: row.workflowRunId,
    workflowId: row.workflowId,
    status: row.status,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt ?? undefined,
    title: row.title ?? undefined,
    tags,
    parentWorkflowRunId: row.parentWorkflowRunId,
    parentStepId: row.parentStepId,
    retriesFromRunId: row.retriesFromRunId,
    replayOfRunId: row.replayOfRunId,
    ...(pending
      ? { suspendHandleId: pending.handle.id, suspendReason: pending.handle.reason }
      : {}),
  };
}

function rowToSuspendRecord(row: typeof suspends.$inferSelect): SuspendRecord {
  const handle: SuspendHandle = {
    id: row.handleId,
    intentId: row.intentId,
    workflowRunId: row.workflowRunId,
    reason: row.reason as SuspendHandle["reason"],
    createdAt: row.createdAt,
  };
  const record: SuspendRecord = {
    handle,
    intent: JSON.parse(row.intentJson) as EffectIntent,
    status: row.status,
  };
  if (row.decisionJson) {
    record.decision = JSON.parse(row.decisionJson) as SuspendResolveDecision;
  }
  if (row.resolvedAt) {
    record.resolvedAt = row.resolvedAt;
  }
  return record;
}
