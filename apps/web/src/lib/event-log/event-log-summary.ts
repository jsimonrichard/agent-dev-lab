import type { LoggedRunEvent, RunEvent } from "@agent-dev-lab/core";

export type EventLogFamily = "workflow" | "step" | "agent" | "custom" | "title";

export function eventLogFamily(type: RunEvent["type"]): EventLogFamily {
  if (type === "custom") {
    return "custom";
  }
  if (type === "workflow_title_set" || type === "agent_title_set") {
    return "title";
  }
  if (type.startsWith("step_")) {
    return "step";
  }
  if (type.startsWith("agent_")) {
    return "agent";
  }
  return "workflow";
}

export function summarizeRunEvent(event: RunEvent): string {
  switch (event.type) {
    case "workflow_started":
      return event.workflowId;
    case "workflow_finished":
      return "finished";
    case "workflow_failed":
      return "failed";
    case "workflow_cancelled":
      return "cancelled";
    case "step_started":
    case "step_finished":
    case "step_skipped":
    case "step_failed":
      return event.key ? `${event.name} (${event.key})` : event.name;
    case "custom":
      return event.name;
    case "workflow_title_set":
    case "agent_title_set":
      return event.title;
    case "agent_started":
    case "agent_finished":
    case "agent_failed":
      return event.agentId;
    case "agent_warning":
      return event.message.length > 72 ? `${event.message.slice(0, 72)}…` : event.message;
    case "agent_tool_call":
    case "agent_tool_result":
      return event.toolName;
    case "agent_text_delta":
      return event.delta.length > 48 ? `${event.delta.slice(0, 48)}…` : event.delta;
    case "agent_messages_committed":
      return `${event.count} message${event.count === 1 ? "" : "s"} · ${event.memoryScope}`;
    default:
      return "";
  }
}

export function formatEventLogTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  const day = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
  const time = date.toLocaleTimeString(undefined, {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  return `${day} ${time}.${String(date.getMilliseconds()).padStart(3, "0")}`;
}

export type EventLogLink =
  | { kind: "workflow-run"; workflowId: string; runId: string; stepId?: string }
  | { kind: "agent-call"; agentId: string; memoryScope: string; agentCallId: string }
  | { kind: "conversation"; agentId: string; memoryScope: string }
  | { kind: "workflow"; workflowId: string }
  | { kind: "agent"; agentId: string };

export type EventLogResolveContext = {
  workflowIds: Map<string, string>;
  agentSessions: Map<string, { agentId: string; memoryScope: string }>;
};

export function eventLogResolvedWorkflowId(
  event: RunEvent,
  resolve?: EventLogResolveContext,
): string | undefined {
  if ("workflowId" in event && typeof event.workflowId === "string" && event.workflowId) {
    return event.workflowId;
  }
  if ("workflowRunId" in event && event.workflowRunId) {
    return resolve?.workflowIds.get(event.workflowRunId);
  }
  return undefined;
}

export function eventLogResolvedAgentId(
  event: RunEvent,
  resolve?: EventLogResolveContext,
): string | undefined {
  if ("agentId" in event && typeof event.agentId === "string" && event.agentId) {
    return event.agentId;
  }
  if ("agentCallId" in event && event.agentCallId) {
    return resolve?.agentSessions.get(event.agentCallId)?.agentId;
  }
  return undefined;
}

export function eventLogResolvedMemoryScope(
  event: RunEvent,
  resolve?: EventLogResolveContext,
): string | undefined {
  if ("memoryScope" in event && typeof event.memoryScope === "string" && event.memoryScope) {
    return event.memoryScope;
  }
  if ("agentCallId" in event && event.agentCallId) {
    return resolve?.agentSessions.get(event.agentCallId)?.memoryScope;
  }
  return undefined;
}

export function workflowIdByRunId(events: LoggedRunEvent[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const entry of events) {
    if (entry.event.type === "workflow_started") {
      map.set(entry.event.workflowRunId, entry.event.workflowId);
    }
  }
  return map;
}

export function agentSessionByCallId(
  events: LoggedRunEvent[],
): Map<string, { agentId: string; memoryScope: string }> {
  const map = new Map<string, { agentId: string; memoryScope: string }>();
  for (const entry of events) {
    if (entry.event.type === "agent_started") {
      map.set(entry.event.agentCallId, {
        agentId: entry.event.agentId,
        memoryScope: entry.event.memoryScope,
      });
    }
  }
  return map;
}

/** Human labels for object columns. */
export type EventLogObjectLabels = {
  workflow: Map<string, string>;
  workflowRun: Map<string, string>;
  agent: Map<string, string>;
  conversation: Map<string, string>;
  agentCall: Map<string, string>;
  stepId: Map<string, string>;
};

export type EventLogNamedOption = {
  value: string;
  label: string;
};

/** Sentinel for `equals` / `not-equals` when the field is omitted from the event. */
export const EVENT_LOG_FILTER_ABSENT = "__not_present__";

export function eventLogFilterValueLabel(value: string, displayValue?: string): string {
  if (value === EVENT_LOG_FILTER_ABSENT) {
    return "Not present";
  }
  return displayValue ?? value;
}

const EVENT_LOG_NAMED_SOURCE_FIELDS = {
  workflow: "workflowId",
  workflowRun: "workflowRunId",
  agent: "agentId",
  conversation: "memoryScope",
  agentCall: "agentCallId",
  stepId: "stepId",
} as const;

export type EventLogObjectLabelExtras = {
  runs?: ReadonlyArray<{ runId: string; workflowId: string; title?: string }>;
  sessions?: ReadonlyArray<{
    agentCallId: string;
    agentId: string;
    memoryScope: string;
    title: string;
  }>;
};

export function isEventLogObjectLabelField(field: string): field is keyof EventLogObjectLabels {
  return (
    field === "workflow" ||
    field === "workflowRun" ||
    field === "agent" ||
    field === "conversation" ||
    field === "agentCall" ||
    field === "stepId"
  );
}

function namedFieldRawValue(
  event: RunEvent,
  field: keyof EventLogObjectLabels,
  resolve?: EventLogResolveContext,
): { kind: "absent" } | { kind: "null" } | { kind: "value"; value: string } {
  if (field === "workflow") {
    const workflowId = eventLogResolvedWorkflowId(event, resolve);
    return workflowId ? { kind: "value", value: workflowId } : { kind: "absent" };
  }
  if (field === "agent") {
    const agentId = eventLogResolvedAgentId(event, resolve);
    return agentId ? { kind: "value", value: agentId } : { kind: "absent" };
  }
  if (field === "conversation") {
    const memoryScope = eventLogResolvedMemoryScope(event, resolve);
    return memoryScope ? { kind: "value", value: memoryScope } : { kind: "absent" };
  }
  const sourceField = EVENT_LOG_NAMED_SOURCE_FIELDS[field];
  const record = event as unknown as Record<string, unknown>;
  if (!Object.hasOwn(record, sourceField)) {
    return { kind: "absent" };
  }
  const raw = record[sourceField];
  if (raw === null) {
    return { kind: "null" };
  }
  if (raw == null || raw === "") {
    return { kind: "absent" };
  }
  return { kind: "value", value: stringifyNamedFilterValue(raw) };
}

function stringifyNamedFilterValue(value: unknown): string {
  return typeof value === "string" ? value : String(value);
}

/** Distinct ids for a named column, labeled with the table display name. */
export function eventLogNamedFilterOptions(
  events: LoggedRunEvent[],
  labels: EventLogObjectLabels,
  field: keyof EventLogObjectLabels,
  resolve?: EventLogResolveContext,
): EventLogNamedOption[] {
  const ids = new Set<string>(labels[field].keys());
  let hasAbsent = false;
  let hasNull = false;
  for (const entry of events) {
    const raw = namedFieldRawValue(entry.event, field, resolve);
    if (raw.kind === "absent") {
      hasAbsent = true;
    } else if (raw.kind === "null") {
      hasNull = true;
    } else if (raw.value) {
      ids.add(raw.value);
    }
  }
  const options = [...ids]
    .map((value) => ({ value, label: labels[field].get(value) ?? value }))
    .sort((a, b) => a.label.localeCompare(b.label) || a.value.localeCompare(b.value));
  if (hasNull) {
    options.unshift({ value: "null", label: "null" });
  }
  if (hasAbsent) {
    options.unshift({ value: EVENT_LOG_FILTER_ABSENT, label: "Not present" });
  }
  return options;
}

/** Table text for an id column: run/conversation title, step name, or the raw id. */
export function eventLogCellLabel(
  cell: { field: string; filterValue: string; display: string },
  labels: EventLogObjectLabels,
): string {
  if (isEventLogObjectLabelField(cell.field)) {
    return labels[cell.field].get(cell.filterValue) ?? cell.display;
  }
  return cell.display;
}

/**
 * Resolve run/conversation titles from the live log, then fill gaps from persisted extras.
 * Workflow and agent maps store registry ids; those names live on the workflow/agent
 * columns rather than as fallbacks for run/conversation titles. Agent calls stay as ids.
 */
export function eventLogObjectLabels(
  events: LoggedRunEvent[],
  extras?: EventLogObjectLabelExtras,
): EventLogObjectLabels {
  const workflow = new Map<string, string>();
  const workflowRun = new Map<string, string>();
  const agent = new Map<string, string>();
  const conversation = new Map<string, string>();
  const agentCall = new Map<string, string>();
  const stepId = new Map<string, string>();

  for (const entry of events) {
    const event = entry.event;
    const workflowId = eventLogResolvedWorkflowId(event);
    if (workflowId) {
      workflow.set(workflowId, workflowId);
    }
    const agentId = eventLogResolvedAgentId(event);
    if (agentId) {
      agent.set(agentId, agentId);
    }
    switch (event.type) {
      case "workflow_title_set": {
        const title = event.title.trim();
        if (title) {
          workflowRun.set(event.workflowRunId, title);
        }
        break;
      }
      case "agent_title_set": {
        const title = event.title.trim();
        if (title) {
          conversation.set(event.memoryScope, title);
        }
        break;
      }
      case "step_started":
      case "step_finished":
      case "step_skipped":
      case "step_failed":
        stepId.set(event.stepId, event.key ? `${event.name} (${event.key})` : event.name);
        break;
      default:
        break;
    }
  }

  for (const run of extras?.runs ?? []) {
    if (run.workflowId) {
      workflow.set(run.workflowId, run.workflowId);
    }
    const title = run.title?.trim();
    if (title && !workflowRun.has(run.runId)) {
      workflowRun.set(run.runId, title);
    }
  }

  for (const session of extras?.sessions ?? []) {
    if (session.agentId) {
      agent.set(session.agentId, session.agentId);
    }
    const title = session.title.trim();
    if (title && !conversation.has(session.memoryScope)) {
      conversation.set(session.memoryScope, title);
    }
  }

  return { workflow, workflowRun, agent, conversation, agentCall, stepId };
}

export function eventLogLinkForField(
  field: string,
  event: RunEvent,
  workflows: Map<string, string>,
  agents: Map<string, { agentId: string; memoryScope: string }>,
): EventLogLink | null {
  const resolve = { workflowIds: workflows, agentSessions: agents };
  if (field === "workflow") {
    const workflowId = eventLogResolvedWorkflowId(event, resolve);
    return workflowId ? { kind: "workflow", workflowId } : null;
  }
  if (field === "agent") {
    const agentId = eventLogResolvedAgentId(event, resolve);
    return agentId ? { kind: "agent", agentId } : null;
  }
  if (field === "conversation" || field === "memoryScope") {
    const memoryScope = eventLogResolvedMemoryScope(event, resolve);
    const agentId = eventLogResolvedAgentId(event, resolve);
    return memoryScope && agentId ? { kind: "conversation", agentId, memoryScope } : null;
  }
  if (field === "workflowRun" || field === "workflowRunId") {
    const runId = "workflowRunId" in event ? event.workflowRunId : undefined;
    if (!runId) {
      return null;
    }
    const workflowId = workflows.get(runId);
    return workflowId ? { kind: "workflow-run", workflowId, runId } : null;
  }
  if (field === "stepId") {
    const stepId = "stepId" in event ? event.stepId : undefined;
    const runId = "workflowRunId" in event ? event.workflowRunId : undefined;
    if (!stepId || !runId) {
      return null;
    }
    const workflowId = workflows.get(runId);
    return workflowId ? { kind: "workflow-run", workflowId, runId, stepId } : null;
  }
  if (field === "agentCall" || field === "agentCallId") {
    if (!("agentCallId" in event) || !event.agentCallId) {
      return null;
    }
    const agentCallId = event.agentCallId;
    if (event.type === "agent_started") {
      return {
        kind: "agent-call",
        agentId: event.agentId,
        memoryScope: event.memoryScope,
        agentCallId,
      };
    }
    const session = agents.get(agentCallId);
    return session
      ? {
          kind: "agent-call",
          agentId: session.agentId,
          memoryScope: session.memoryScope,
          agentCallId,
        }
      : null;
  }
  return null;
}

/** Why this inspector link would 404, or `null` if it is safe to follow. */
export function eventLogLinkUnavailableReason(
  link: EventLogLink,
  registeredWorkflowIds: ReadonlySet<string>,
  registeredAgentIds: ReadonlySet<string>,
): string | null {
  if (
    (link.kind === "workflow" || link.kind === "workflow-run") &&
    !registeredWorkflowIds.has(link.workflowId)
  ) {
    return "Not registered as a top-level workflow";
  }
  if (
    (link.kind === "agent" || link.kind === "agent-call" || link.kind === "conversation") &&
    !registeredAgentIds.has(link.agentId)
  ) {
    return "Not registered as a top-level agent";
  }
  return null;
}
