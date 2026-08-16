import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const messages = sqliteTable("adl_messages", {
  memoryScope: text("memory_scope").primaryKey(),
  messagesJson: text("messages_json").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const workflowRuns = sqliteTable("adl_workflow_runs", {
  workflowRunId: text("workflow_run_id").primaryKey(),
  workflowId: text("workflow_id").notNull(),
  status: text("status").notNull(),
  startedAt: text("started_at").notNull(),
  finishedAt: text("finished_at"),
  inputJson: text("input_json"),
  outputJson: text("output_json"),
  title: text("title"),
});

export const workflowEvents = sqliteTable("adl_workflow_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  workflowRunId: text("workflow_run_id"),
  agentCallId: text("agent_call_id"),
  seq: integer("seq").notNull(),
  type: text("type").notNull(),
  at: text("at").notNull(),
  eventSchemaVersion: integer("event_schema_version").notNull(),
  payloadJson: text("payload_json").notNull(),
});

export const stepOutputs = sqliteTable("adl_step_outputs", {
  workflowRunId: text("workflow_run_id").notNull(),
  slotKey: text("slot_key").notNull(),
  outputJson: text("output_json").notNull(),
});

export const stepRecords = sqliteTable("adl_step_records", {
  workflowRunId: text("workflow_run_id").notNull(),
  stepId: text("step_id").notNull(),
  name: text("name").notNull(),
  key: text("key"),
  pathJson: text("path_json").notNull(),
  parentStepId: text("parent_step_id"),
  outputJson: text("output_json"),
  status: text("status").notNull(),
});

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
