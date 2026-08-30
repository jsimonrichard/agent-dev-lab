import type { LoggedRunEvent } from "@agent-dev-lab/core";

import { isPlainObject } from "../json-document";
import {
  EVENT_LOG_FILTER_ABSENT,
  eventLogFilterValueLabel,
  eventLogNamedFilterOptions,
  eventLogResolvedAgentId,
  eventLogResolvedMemoryScope,
  eventLogResolvedWorkflowId,
  isEventLogObjectLabelField,
  type EventLogNamedOption,
  type EventLogObjectLabels,
  type EventLogResolveContext,
} from "./event-log-summary";

export const EVENT_LOG_FLATTEN_MAX_DEPTH = 8;

export type EventLogFilterOp =
  | "equals"
  | "not-equals"
  | "contains"
  | "exists"
  | "is-empty"
  | "is-not-empty";

/** How a filter field should be compared. Enums are closed ids, not free text. */
export type EventLogFilterFieldKind =
  | "string"
  | "enum"
  | "number"
  | "boolean"
  | "datetime"
  | "object"
  | "array"
  | "other";

export type EventLogFilterClause = {
  id: string;
  field: string;
  op: EventLogFilterOp;
  value: string;
};

export type EventLogFilterState = {
  clauses: EventLogFilterClause[];
  query: string;
};

/** Default removable clause so streaming tokens do not flood the list. */
export const HIDE_TEXT_DELTA_CLAUSE: EventLogFilterClause = {
  id: "default-hide-text-delta",
  field: "type",
  op: "not-equals",
  value: "agent_text_delta",
};

export const DEFAULT_EVENT_LOG_FILTERS: EventLogFilterState = {
  clauses: [HIDE_TEXT_DELTA_CLAUSE],
  query: "",
};

export const EVENT_LOG_FILTER_OPS: { op: EventLogFilterOp; label: string }[] = [
  { op: "equals", label: "equals" },
  { op: "not-equals", label: "not equals" },
  { op: "contains", label: "contains" },
  { op: "exists", label: "exists" },
  { op: "is-empty", label: "is empty" },
  { op: "is-not-empty", label: "is not empty" },
];

const EVENT_LOG_VALUE_FILTER_OPS = new Set<EventLogFilterOp>(["equals", "not-equals"]);
const EVENT_LOG_STRING_FILTER_OPS = new Set<EventLogFilterOp>(["contains"]);
const EVENT_LOG_PRESENCE_FILTER_OPS = new Set<EventLogFilterOp>([
  "exists",
  "is-empty",
  "is-not-empty",
]);

/** Closed-set / non-text columns. Source aliases resolve through {@link aliasEventLogFilterField}. */
const EVENT_LOG_KNOWN_FILTER_FIELD_KINDS: Record<string, EventLogFilterFieldKind> = {
  logSeq: "number",
  runSeq: "number",
  eventSchemaVersion: "number",
  durationMs: "number",
  count: "number",
  total: "number",
  at: "datetime",
  type: "enum",
  workflow: "enum",
  workflowRun: "enum",
  agent: "enum",
  conversation: "enum",
  agentCall: "enum",
  stepId: "enum",
  parentStepId: "enum",
  status: "enum",
};

export function eventLogKnownFilterFieldKind(field: string): EventLogFilterFieldKind | undefined {
  return EVENT_LOG_KNOWN_FILTER_FIELD_KINDS[aliasEventLogFilterField(field)];
}

export function eventLogFilterFieldKind(
  field: string,
  kinds?: Readonly<Record<string, EventLogFilterFieldKind>>,
): EventLogFilterFieldKind {
  const aliased = aliasEventLogFilterField(field);
  return eventLogKnownFilterFieldKind(aliased) ?? kinds?.[aliased] ?? kinds?.[field] ?? "string";
}

export function eventLogFilterOpsForKind(
  kind: EventLogFilterFieldKind,
): { op: EventLogFilterOp; label: string }[] {
  return EVENT_LOG_FILTER_OPS.filter((item) => {
    if (EVENT_LOG_PRESENCE_FILTER_OPS.has(item.op)) {
      return true;
    }
    if (kind === "object" || kind === "array") {
      return false;
    }
    if (EVENT_LOG_STRING_FILTER_OPS.has(item.op)) {
      return kind === "string";
    }
    return EVENT_LOG_VALUE_FILTER_OPS.has(item.op);
  });
}

export function eventLogFilterOpsForField(
  field: string,
  kinds?: Readonly<Record<string, EventLogFilterFieldKind>>,
): { op: EventLogFilterOp; label: string }[] {
  return eventLogFilterOpsForKind(eventLogFilterFieldKind(field, kinds));
}

export function eventLogDefaultFilterOp(
  field: string,
  kinds?: Readonly<Record<string, EventLogFilterFieldKind>>,
): EventLogFilterOp {
  return eventLogFilterOpsForField(field, kinds)[0]?.op ?? "equals";
}

export function eventLogFilterOpNeedsValue(op: EventLogFilterOp): boolean {
  return !EVENT_LOG_PRESENCE_FILTER_OPS.has(op);
}

export function isEventLogFilterOpAllowed(
  field: string,
  op: EventLogFilterOp,
  kinds?: Readonly<Record<string, EventLogFilterFieldKind>>,
): boolean {
  return eventLogFilterOpsForField(field, kinds).some((item) => item.op === op);
}

/** True when a flattened path walks through an array index (`messages.0.content`). */
export function isEventLogIndexedFilterField(field: string): boolean {
  return field.split(".").some((segment) => /^\d+$/.test(segment));
}

export function isEventLogFilterPickerField(field: string): boolean {
  return !isEventLogIndexedFilterField(field);
}

/** Distinct values for enum fields (`type`, workflow, …). Text fields return null. */
export function eventLogEnumFilterOptions(
  events: LoggedRunEvent[],
  field: string,
  labels: EventLogObjectLabels,
  resolve?: EventLogResolveContext,
  kinds?: Readonly<Record<string, EventLogFilterFieldKind>>,
): EventLogNamedOption[] | null {
  if (isEventLogObjectLabelField(field)) {
    return eventLogNamedFilterOptions(events, labels, field, resolve);
  }
  if (eventLogFilterFieldKind(field, kinds) !== "enum") {
    return null;
  }
  return collectEnumFilterValues(events, field, resolve);
}

function collectEnumFilterValues(
  events: LoggedRunEvent[],
  field: string,
  resolve?: EventLogResolveContext,
): EventLogNamedOption[] {
  const values = new Set<string>();
  let hasAbsent = false;
  let hasNull = false;
  const key = aliasEventLogFilterField(field);
  for (const entry of events) {
    const fields = flattenLoggedEvent(entry, undefined, resolve);
    if (!Object.hasOwn(fields, key)) {
      hasAbsent = true;
      continue;
    }
    const raw = fields[key]!;
    if (raw === "null") {
      hasNull = true;
    } else if (raw) {
      values.add(raw);
    }
  }
  const options = [...values]
    .map((value) => ({ value, label: value }))
    .sort((a, b) => a.label.localeCompare(b.label) || a.value.localeCompare(b.value));
  if (hasNull) {
    options.unshift({ value: "null", label: "null" });
  }
  if (hasAbsent) {
    options.unshift({ value: EVENT_LOG_FILTER_ABSENT, label: "Not present" });
  }
  return options;
}

export function createFilterClause(
  clause: Omit<EventLogFilterClause, "id"> & { id?: string },
): EventLogFilterClause {
  return {
    id: clause.id ?? crypto.randomUUID(),
    field: clause.field,
    op: clause.op,
    value: clause.value,
  };
}

export function joinEventLogPath(parent: string, key: string): string {
  return parent ? `${parent}.${key}` : key;
}

export function stringifyEventLogValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value === null) {
    return "null";
  }
  if (value === undefined) {
    return "";
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** Event payload keys that the table and filters show under a shorter name. */
export const EVENT_LOG_FIELD_ALIASES = {
  workflowRunId: "workflowRun",
  agentCallId: "agentCall",
  workflowId: "workflow",
  agentId: "agent",
  memoryScope: "conversation",
} as const;

const EVENT_LOG_FILTER_FIELD_PRIORITY = [
  "logSeq",
  "at",
  "type",
  "runSeq",
  "workflow",
  "workflowRun",
  "agent",
  "conversation",
  "agentCall",
  "stepId",
] as const;

export function aliasEventLogFilterField(field: string): string {
  return field in EVENT_LOG_FIELD_ALIASES
    ? EVENT_LOG_FIELD_ALIASES[field as keyof typeof EVENT_LOG_FIELD_ALIASES]
    : field;
}

export function eventLogFilterSourceField(field: string): string {
  if (field === "workflowRun") {
    return "workflowRunId";
  }
  if (field === "agentCall") {
    return "agentCallId";
  }
  if (field === "workflow") {
    return "workflowId";
  }
  if (field === "agent") {
    return "agentId";
  }
  if (field === "conversation") {
    return "memoryScope";
  }
  return field;
}

function applyEventLogFieldAliases(fields: Record<string, string>): void {
  for (const [source, alias] of Object.entries(EVENT_LOG_FIELD_ALIASES)) {
    if (Object.hasOwn(fields, source)) {
      fields[alias] = fields[source]!;
    }
  }
}

function compareEventLogFilterFields(a: string, b: string): number {
  const aPriority = (EVENT_LOG_FILTER_FIELD_PRIORITY as readonly string[]).indexOf(a);
  const bPriority = (EVENT_LOG_FILTER_FIELD_PRIORITY as readonly string[]).indexOf(b);
  if (aPriority !== -1 || bPriority !== -1) {
    if (aPriority === -1) {
      return 1;
    }
    if (bPriority === -1) {
      return -1;
    }
    return aPriority - bPriority;
  }
  return a.localeCompare(b);
}

function applyResolvedIdentities(
  fields: Record<string, string>,
  entry: LoggedRunEvent,
  resolve?: EventLogResolveContext,
): void {
  if (!resolve) {
    return;
  }
  if (!fields.workflowId) {
    const workflowId = eventLogResolvedWorkflowId(entry.event, resolve);
    if (workflowId) {
      fields.workflowId = workflowId;
    }
  }
  if (!fields.agentId) {
    const agentId = eventLogResolvedAgentId(entry.event, resolve);
    if (agentId) {
      fields.agentId = agentId;
    }
  }
  if (!fields.memoryScope) {
    const memoryScope = eventLogResolvedMemoryScope(entry.event, resolve);
    if (memoryScope) {
      fields.memoryScope = memoryScope;
    }
  }
}

function flattenLoggedEventDetails(
  entry: LoggedRunEvent,
  maxDepth = EVENT_LOG_FLATTEN_MAX_DEPTH,
  resolve?: EventLogResolveContext,
): { fields: Record<string, string>; kinds: Record<string, EventLogFilterFieldKind> } {
  const fields: Record<string, string> = {};
  const kinds: Record<string, EventLogFilterFieldKind> = {};
  walkValue({ logSeq: entry.logSeq, ...entry.event }, "", 0, fields, kinds, maxDepth);
  applyResolvedIdentities(fields, entry, resolve);
  applyEventLogFieldAliases(fields);
  applyKnownFilterFieldKinds(fields, kinds);
  return { fields, kinds };
}

export function flattenLoggedEvent(
  entry: LoggedRunEvent,
  maxDepth = EVENT_LOG_FLATTEN_MAX_DEPTH,
  resolve?: EventLogResolveContext,
): Record<string, string> {
  return flattenLoggedEventDetails(entry, maxDepth, resolve).fields;
}

export function collectFieldPaths(
  entries: LoggedRunEvent[],
  maxDepth = EVENT_LOG_FLATTEN_MAX_DEPTH,
  resolve?: EventLogResolveContext,
): string[] {
  const keys = new Set<string>();
  for (const entry of entries) {
    const flattened = flattenLoggedEventDetails(entry, maxDepth, resolve);
    for (const key of Object.keys(flattened.fields)) {
      if (key in EVENT_LOG_FIELD_ALIASES) {
        continue;
      }
      const field = aliasEventLogFilterField(key);
      if (!isEventLogFilterPickerField(field)) {
        continue;
      }
      keys.add(field);
    }
  }
  return [...keys].sort(compareEventLogFilterFields);
}

function mergeFilterFieldKinds(
  current: EventLogFilterFieldKind | undefined,
  next: EventLogFilterFieldKind,
): EventLogFilterFieldKind {
  if (current === undefined || current === next) {
    return next;
  }
  return "other";
}

/** Observed compare kinds for flattened fields, with known columns pinned. */
export function collectFieldKinds(
  entries: LoggedRunEvent[],
  maxDepth = EVENT_LOG_FLATTEN_MAX_DEPTH,
  resolve?: EventLogResolveContext,
): Record<string, EventLogFilterFieldKind> {
  const kinds: Record<string, EventLogFilterFieldKind> = {
    ...EVENT_LOG_KNOWN_FILTER_FIELD_KINDS,
  };
  for (const entry of entries) {
    const flattened = flattenLoggedEventDetails(entry, maxDepth, resolve);
    for (const [key, kind] of Object.entries(flattened.kinds)) {
      if (key in EVENT_LOG_FIELD_ALIASES) {
        continue;
      }
      const field = aliasEventLogFilterField(key);
      const known = eventLogKnownFilterFieldKind(field);
      kinds[field] = known ?? mergeFilterFieldKinds(kinds[field], kind);
    }
  }
  return kinds;
}

export function clauseMatchesFields(
  fields: Record<string, string>,
  clause: EventLogFilterClause,
  kinds?: Readonly<Record<string, EventLogFilterFieldKind>>,
): boolean {
  const present = Object.hasOwn(fields, clause.field);
  const raw = present ? fields[clause.field]! : undefined;
  const kind = eventLogFilterFieldKind(clause.field, kinds);
  switch (clause.op) {
    case "exists":
      return present;
    case "is-empty":
      return isEmptyFilterValue(present, raw, kind);
    case "is-not-empty":
      return !isEmptyFilterValue(present, raw, kind);
    case "equals":
      if (!isEventLogFilterOpAllowed(clause.field, clause.op, kinds)) {
        return false;
      }
      if (clause.value === EVENT_LOG_FILTER_ABSENT) {
        return !present;
      }
      return present && raw === clause.value;
    case "not-equals":
      if (!isEventLogFilterOpAllowed(clause.field, clause.op, kinds)) {
        return false;
      }
      if (clause.value === EVENT_LOG_FILTER_ABSENT) {
        return present;
      }
      return !present || raw !== clause.value;
    case "contains":
      if (!isEventLogFilterOpAllowed(clause.field, clause.op, kinds)) {
        return false;
      }
      return present && (raw ?? "").toLowerCase().includes(clause.value.toLowerCase());
    default:
      return true;
  }
}

export function eventMatchesFilters(
  entry: LoggedRunEvent,
  state: EventLogFilterState,
  maxDepth = EVENT_LOG_FLATTEN_MAX_DEPTH,
  resolve?: EventLogResolveContext,
): boolean {
  const { fields, kinds } = flattenLoggedEventDetails(entry, maxDepth, resolve);
  for (const clause of state.clauses) {
    if (!clause.field.trim()) {
      continue;
    }
    if (!clauseMatchesFields(fields, clause, kinds)) {
      return false;
    }
  }
  const query = state.query.trim().toLowerCase();
  if (!query) {
    return true;
  }
  return Object.values(fields).some((value) => value.toLowerCase().includes(query));
}

export function filterLoggedEvents(
  entries: LoggedRunEvent[],
  state: EventLogFilterState,
  resolve?: EventLogResolveContext,
): LoggedRunEvent[] {
  return entries.filter((entry) => eventMatchesFilters(entry, state, undefined, resolve));
}

export function formatFilterClause(clause: EventLogFilterClause, displayValue?: string): string {
  const field = aliasEventLogFilterField(clause.field);
  const opLabel = clause.op.replaceAll("-", " ");
  if (!eventLogFilterOpNeedsValue(clause.op)) {
    return `${field} ${opLabel}`;
  }
  return `${field} ${opLabel} ${eventLogFilterValueLabel(clause.value, displayValue)}`;
}

/** Flattened filter value for a field, or {@link EVENT_LOG_FILTER_ABSENT} when omitted. */
export function eventLogFilterCellValue(
  entry: LoggedRunEvent,
  field: string,
  resolve?: EventLogResolveContext,
): string {
  const fields = flattenLoggedEvent(entry, undefined, resolve);
  const key = aliasEventLogFilterField(field);
  if (!Object.hasOwn(fields, key)) {
    return EVENT_LOG_FILTER_ABSENT;
  }
  return fields[key]!;
}

function isEmptyFilterValue(
  present: boolean,
  raw: string | undefined,
  kind: EventLogFilterFieldKind,
): boolean {
  if (!present || raw === undefined || raw === "" || raw === "null") {
    return true;
  }
  if (kind === "array") {
    return raw === "[]";
  }
  if (kind === "object") {
    return raw === "{}";
  }
  return false;
}

function inferFilterFieldKind(value: unknown): EventLogFilterFieldKind | undefined {
  if (typeof value === "string") {
    return "string";
  }
  if (typeof value === "number") {
    return "number";
  }
  if (typeof value === "boolean") {
    return "boolean";
  }
  if (Array.isArray(value)) {
    return "array";
  }
  if (value === null) {
    return undefined;
  }
  if (isPlainObject(value)) {
    return "object";
  }
  return "string";
}

function applyKnownFilterFieldKinds(
  fields: Record<string, string>,
  kinds: Record<string, EventLogFilterFieldKind>,
): void {
  for (const field of Object.keys(fields)) {
    const known = eventLogKnownFilterFieldKind(field);
    if (known) {
      kinds[field] = known;
    }
  }
}

function walkValue(
  value: unknown,
  path: string,
  depth: number,
  fields: Record<string, string>,
  kinds: Record<string, EventLogFilterFieldKind>,
  maxDepth: number,
): void {
  if (value === undefined) {
    return;
  }
  if (path) {
    fields[path] = stringifyEventLogValue(value);
    const kind = inferFilterFieldKind(value);
    if (kind) {
      kinds[path] = kind;
    }
  }
  if (depth >= maxDepth) {
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      walkValue(item, joinEventLogPath(path, String(index)), depth + 1, fields, kinds, maxDepth);
    });
    return;
  }
  if (isPlainObject(value)) {
    for (const [key, child] of Object.entries(value)) {
      walkValue(child, joinEventLogPath(path, key), depth + 1, fields, kinds, maxDepth);
    }
  }
}
