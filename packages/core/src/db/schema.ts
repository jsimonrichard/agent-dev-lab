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

export const inspectorSessions = sqliteTable("adl_inspector_sessions", {
  memoryScope: text("memory_scope").primaryKey(),
  agentId: text("agent_id").notNull(),
  agentCallId: text("agent_call_id").notNull(),
  title: text("title").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  forkJson: text("fork_json"),
  deletedAt: text("deleted_at"),
});

export type MessageRow = typeof messages.$inferSelect;
export type WorkflowRunRow = typeof workflowRuns.$inferSelect;
