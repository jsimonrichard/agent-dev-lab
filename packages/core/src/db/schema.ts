import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Drizzle description of the ADL tables, used for typed queries and by
 * `drizzle-kit`. The runtime DDL lives in `ensure-schema.ts`, which also
 * migrates existing local databases; keep the two in step — a table or key
 * described here but missing there (or vice versa) is a real defect.
 */

export const messages = sqliteTable("adl_messages", {
  memoryScope: text("memory_scope").primaryKey(),
  messagesJson: text("messages_json").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/** Matches {@link WorkflowRunSummary.status} in `observability/events.ts`. */
export const WORKFLOW_RUN_STATUSES = ["running", "ok", "error", "cancelled"] as const;

export const workflowRuns = sqliteTable("adl_workflow_runs", {
  workflowRunId: text("workflow_run_id").primaryKey(),
  workflowId: text("workflow_id").notNull(),
  status: text("status", { enum: WORKFLOW_RUN_STATUSES }).notNull(),
  startedAt: text("started_at").notNull(),
  finishedAt: text("finished_at"),
  inputJson: text("input_json"),
  outputJson: text("output_json"),
  title: text("title"),
});

export const runEvents = sqliteTable(
  "adl_run_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    workflowRunId: text("workflow_run_id"),
    agentCallId: text("agent_call_id"),
    /**
     * Set only for conversation-scoped events (no owning run or episode —
     * see `ConversationEventBase`), never in addition to workflowRunId/
     * agentCallId: those carry per-run counters, so mixing memory_scope in
     * for them would make `runSeq` non-monotonic within this column's own
     * scope. A conversation's episodes stay reachable via
     * adl_agent_episodes.memory_scope instead.
     */
    memoryScope: text("memory_scope"),
    /** Per-run / per-episode order. Same value as `RunEvent.runSeq`. */
    runSeq: integer("run_seq").notNull(),
    type: text("type").notNull(),
    at: text("at").notNull(),
    eventSchemaVersion: integer("event_schema_version").notNull().default(1),
    payloadJson: text("payload_json").notNull(),
  },
  (table) => [
    index("adl_run_events_run_seq").on(table.workflowRunId, table.runSeq),
    index("adl_run_events_agent_seq").on(table.agentCallId, table.runSeq),
    index("adl_run_events_type").on(table.type),
    index("adl_run_events_memory_scope_seq").on(table.memoryScope, table.runSeq),
  ],
);

export const stepOutputs = sqliteTable(
  "adl_step_outputs",
  {
    workflowRunId: text("workflow_run_id").notNull(),
    slotKey: text("slot_key").notNull(),
    outputJson: text("output_json").notNull(),
  },
  (table) => [primaryKey({ columns: [table.workflowRunId, table.slotKey] })],
);

/** Matches {@link StepRecord.status} in `observability/events.ts`. */
export const STEP_RECORD_STATUSES = ["ok", "error"] as const;

export const stepRecords = sqliteTable(
  "adl_step_records",
  {
    workflowRunId: text("workflow_run_id").notNull(),
    stepId: text("step_id").notNull(),
    name: text("name").notNull(),
    key: text("key"),
    pathJson: text("path_json").notNull(),
    parentStepId: text("parent_step_id"),
    outputJson: text("output_json"),
    status: text("status", { enum: STEP_RECORD_STATUSES }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.workflowRunId, table.stepId] })],
);

export const workflowRunTags = sqliteTable(
  "adl_workflow_run_tags",
  {
    workflowRunId: text("workflow_run_id").notNull(),
    tag: text("tag").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.workflowRunId, table.tag] }),
    index("adl_workflow_run_tags_tag").on(table.tag),
  ],
);

/** Matches {@link AgentEpisodeSummary.status} in `observability/workflow-store.ts`. */
export const AGENT_EPISODE_STATUSES = ["running", "ok", "error"] as const;

/**
 * One row per `agent.run()` episode, projected from `agent_started` /
 * `agent_finished` / `agent_failed` — a single row for the episode's mutable
 * lifecycle (`status`, `finishedAt`) rather than splitting start and terminal
 * state across two event rows. `modelId`/`modelProvider` are nullable
 * placeholders for the `{ modelId, provider }` descriptor Lane E adds to
 * `agent_started`; this lane persists what that event carries, once it does.
 */
export const agentEpisodes = sqliteTable(
  "adl_agent_episodes",
  {
    agentCallId: text("agent_call_id").primaryKey(),
    agentId: text("agent_id").notNull(),
    memoryScope: text("memory_scope").notNull(),
    workflowRunId: text("workflow_run_id"),
    stepId: text("step_id"),
    startedAt: text("started_at").notNull(),
    finishedAt: text("finished_at"),
    status: text("status", { enum: AGENT_EPISODE_STATUSES }).notNull(),
    modelId: text("model_id"),
    modelProvider: text("model_provider"),
  },
  (table) => [
    index("adl_agent_episodes_started_at").on(table.startedAt),
    index("adl_agent_episodes_agent_started_at").on(table.agentId, table.startedAt),
  ],
);

/**
 * Metadata *about* a conversation — not the source of truth for message
 * content (that stays `messages`, keyed the same way by `memory_scope`).
 */
export const conversationMetadata = sqliteTable("adl_conversation_metadata", {
  memoryScope: text("memory_scope").primaryKey(),
  agentId: text("agent_id").notNull(),
  /** Null until the conversation's first episode exists — a fork predates its first turn. */
  agentCallId: text("agent_call_id"),
  title: text("title").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  forkJson: text("fork_json"),
  deletedAt: text("deleted_at"),
});

export type MessageRow = typeof messages.$inferSelect;
export type WorkflowRunRow = typeof workflowRuns.$inferSelect;
