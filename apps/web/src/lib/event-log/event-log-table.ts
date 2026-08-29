import type { LoggedRunEvent } from "@agent-dev-lab/core";

import {
  collectFieldPaths,
  eventLogFilterSourceField,
  stringifyEventLogValue,
} from "./event-log-filter";
import {
  eventLogResolvedAgentId,
  eventLogResolvedMemoryScope,
  eventLogResolvedWorkflowId,
  type EventLogResolveContext,
} from "./event-log-summary";

/** Columns present on every RunEvent, plus ids that appear on most events. */
export const EVENT_LOG_TABLE_COLUMNS = [
  { field: "logSeq", label: "logSeq" },
  { field: "at", label: "at" },
  { field: "type", label: "type" },
  { field: "seq", label: "seq" },
  { field: "workflow", label: "workflow" },
  { field: "workflowRun", label: "workflowRun" },
  { field: "agent", label: "agent" },
  { field: "conversation", label: "conversation" },
  { field: "agentCall", label: "agentCall" },
  { field: "stepId", label: "stepId" },
] as const;

export type EventLogTableField = (typeof EVENT_LOG_TABLE_COLUMNS)[number]["field"];

/** Sequence counters are always present and rarely useful in the table. */
export const EVENT_LOG_DEFAULT_HIDDEN_FIELDS: ReadonlySet<EventLogTableField> = new Set([
  "logSeq",
  "seq",
]);

export type EventLogTableCell = {
  field: EventLogTableField;
  /** Value used for equals filters (matches {@link flattenLoggedEvent}). */
  filterValue: string;
  /** Shown in the table; may be a formatted form of `filterValue`. */
  display: string;
};

export function eventLogTableCell(
  entry: LoggedRunEvent,
  field: EventLogTableField,
  resolve?: EventLogResolveContext,
): EventLogTableCell | null {
  if (field === "logSeq") {
    const filterValue = String(entry.logSeq);
    return { field, filterValue, display: filterValue };
  }

  if (field === "workflow") {
    const workflowId = eventLogResolvedWorkflowId(entry.event, resolve);
    return workflowId ? { field, filterValue: workflowId, display: workflowId } : null;
  }
  if (field === "agent") {
    const agentId = eventLogResolvedAgentId(entry.event, resolve);
    return agentId ? { field, filterValue: agentId, display: agentId } : null;
  }
  if (field === "conversation") {
    const memoryScope = eventLogResolvedMemoryScope(entry.event, resolve);
    return memoryScope ? { field, filterValue: memoryScope, display: memoryScope } : null;
  }

  const record = entry.event as unknown as Record<string, unknown>;
  const sourceField = eventLogFilterSourceField(field);
  if (!Object.hasOwn(record, sourceField)) {
    return null;
  }
  const raw = record[sourceField];
  if (raw === undefined || raw === "") {
    return null;
  }
  if (raw === null) {
    return { field, filterValue: "null", display: "—" };
  }
  const filterValue = stringifyEventLogValue(raw);
  return { field, filterValue, display: filterValue };
}

export function eventLogTableCells(
  entry: LoggedRunEvent,
  resolve?: EventLogResolveContext,
): EventLogTableCell[] {
  return EVENT_LOG_TABLE_COLUMNS.map((column) =>
    eventLogTableCell(entry, column.field, resolve),
  ).filter((cell): cell is EventLogTableCell => cell !== null);
}

export function isEventLogTableField(
  field: string | null | undefined,
): field is EventLogTableField {
  return EVENT_LOG_TABLE_COLUMNS.some((column) => column.field === field);
}

/** Fields that have at least one value in this set of events. */
export function eventLogPresentFields(
  entries: LoggedRunEvent[],
  resolve?: EventLogResolveContext,
): Set<EventLogTableField> {
  const present = new Set<EventLogTableField>();
  for (const entry of entries) {
    for (const column of EVENT_LOG_TABLE_COLUMNS) {
      if (eventLogTableCell(entry, column.field, resolve)) {
        present.add(column.field);
      }
    }
  }
  return present;
}

export function eventLogColumnVisibility(
  userVisibility: Record<string, boolean>,
  presentFields: ReadonlySet<EventLogTableField>,
): Record<string, boolean> {
  const next = { ...userVisibility };
  for (const column of EVENT_LOG_TABLE_COLUMNS) {
    if (!presentFields.has(column.field)) {
      next[column.field] = false;
    } else if (
      !(column.field in userVisibility) &&
      EVENT_LOG_DEFAULT_HIDDEN_FIELDS.has(column.field)
    ) {
      next[column.field] = false;
    }
  }
  return next;
}

export function eventLogHiddenColumnIds(
  userVisibility: Record<string, boolean>,
  presentFields: ReadonlySet<EventLogTableField>,
): EventLogTableField[] {
  const visibility = eventLogColumnVisibility(userVisibility, presentFields);
  return EVENT_LOG_TABLE_COLUMNS.map((column) => column.field).filter(
    (field) => presentFields.has(field) && visibility[field] === false,
  );
}

/** Hidden columns that should mark a row (excludes default-hidden sequence fields). */
export function eventLogRowHiddenColumnIds(
  hiddenColumnIds: ReadonlyArray<EventLogTableField>,
): EventLogTableField[] {
  return hiddenColumnIds.filter((field) => !EVENT_LOG_DEFAULT_HIDDEN_FIELDS.has(field));
}

/** Persist user overrides of the defaults: extra hides, or shown default-hidden columns. */
export function eventLogUserColumnVisibility(
  nextVisibility: Record<string, boolean>,
  presentFields: ReadonlySet<EventLogTableField>,
): Record<string, boolean> {
  const user: Record<string, boolean> = {};
  for (const column of EVENT_LOG_TABLE_COLUMNS) {
    if (!presentFields.has(column.field) || !(column.field in nextVisibility)) {
      continue;
    }
    const hidden = nextVisibility[column.field] === false;
    const defaultHidden = EVENT_LOG_DEFAULT_HIDDEN_FIELDS.has(column.field);
    if (defaultHidden && !hidden) {
      user[column.field] = true;
    } else if (!defaultHidden && hidden) {
      user[column.field] = false;
    }
  }
  return user;
}

export type EventLogFilterFieldList = {
  columns: EventLogTableField[];
  extra: string[];
};

/** Table columns first, then other flattened event paths (with id aliases applied). */
export function eventLogFilterFieldList(entries: LoggedRunEvent[]): EventLogFilterFieldList {
  const columns = EVENT_LOG_TABLE_COLUMNS.map((column) => column.field);
  const columnSet = new Set<string>(columns);
  const extra = collectFieldPaths(entries).filter((path) => !columnSet.has(path));
  return { columns, extra };
}

export function eventLogHiddenCells(
  entry: LoggedRunEvent,
  hiddenFields: ReadonlyArray<EventLogTableField> | ReadonlySet<EventLogTableField>,
  resolve?: EventLogResolveContext,
): EventLogTableCell[] {
  const fields = Array.isArray(hiddenFields) ? hiddenFields : [...hiddenFields];
  return fields
    .map((field) => eventLogTableCell(entry, field, resolve))
    .filter((cell): cell is EventLogTableCell => cell !== null);
}
