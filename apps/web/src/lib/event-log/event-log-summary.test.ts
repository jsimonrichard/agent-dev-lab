import { describe, expect, it } from "bun:test";

import type { LoggedRunEvent, RunEvent } from "@agent-dev-lab/core";
import { EVENT_SCHEMA_VERSION } from "@agent-dev-lab/core";

import {
  EVENT_LOG_FILTER_ABSENT,
  eventLogCellLabel,
  eventLogLinkForField,
  eventLogLinkUnavailableReason,
  eventLogNamedFilterOptions,
  eventLogObjectLabels,
  formatEventLogTime,
} from "./event-log-summary";

const AT = "2026-01-01T00:00:00.000Z";

const started: RunEvent = {
  type: "workflow_started",
  workflowRunId: "run-1",
  workflowId: "demo",
  input: {},
  runSeq: 1,
  at: AT,
  eventSchemaVersion: EVENT_SCHEMA_VERSION,
};

const agent: RunEvent = {
  type: "agent_text_delta",
  agentCallId: "call-1",
  workflowRunId: "run-1",
  runSeq: 4,
  at: AT,
  eventSchemaVersion: EVENT_SCHEMA_VERSION,
  delta: "Hi",
};

const agentStarted: RunEvent = {
  type: "agent_started",
  agentCallId: "call-1",
  agentId: "writer",
  memoryScope: "notes",
  runSeq: 1,
  at: AT,
  eventSchemaVersion: EVENT_SCHEMA_VERSION,
};

describe("eventLogLinkForField", () => {
  const workflows = new Map([["run-1", "demo"]]);
  const agents = new Map([["call-1", { agentId: "writer", memoryScope: "notes" }]]);

  it("links workflowRun to the inspector run", () => {
    expect(eventLogLinkForField("workflowRun", started, workflows, agents)).toEqual({
      kind: "workflow-run",
      workflowId: "demo",
      runId: "run-1",
    });
    expect(eventLogLinkForField("workflow", started, workflows, agents)).toEqual({
      kind: "workflow",
      workflowId: "demo",
    });
    expect(eventLogLinkForField("type", started, workflows, agents)).toBeNull();
  });

  it("links agentCall to the conversation with a call search param", () => {
    expect(eventLogLinkForField("agentCall", agent, workflows, agents)).toEqual({
      kind: "agent-call",
      agentId: "writer",
      memoryScope: "notes",
      agentCallId: "call-1",
    });
    expect(eventLogLinkForField("agentCall", agentStarted, workflows, agents)).toEqual({
      kind: "agent-call",
      agentId: "writer",
      memoryScope: "notes",
      agentCallId: "call-1",
    });
    expect(eventLogLinkForField("conversation", agentStarted, workflows, agents)).toEqual({
      kind: "conversation",
      agentId: "writer",
      memoryScope: "notes",
    });
    expect(eventLogLinkForField("agent", agentStarted, workflows, agents)).toEqual({
      kind: "agent",
      agentId: "writer",
    });
  });

  it("links stepId to the inspector run with a step search param", () => {
    const stepStarted: RunEvent = {
      type: "step_started",
      workflowRunId: "run-1",
      stepId: "step-1",
      parentStepId: null,
      name: "agent-turn",
      key: "0",
      path: ["agent-turn"],
      runSeq: 2,
      at: AT,
      eventSchemaVersion: EVENT_SCHEMA_VERSION,
    };
    expect(eventLogLinkForField("stepId", stepStarted, workflows, agents)).toEqual({
      kind: "workflow-run",
      workflowId: "demo",
      runId: "run-1",
      stepId: "step-1",
    });
    expect(eventLogLinkForField("stepId", started, workflows, agents)).toBeNull();
  });

  it("returns null when the id cannot be resolved to a run", () => {
    expect(eventLogLinkForField("workflowRun", started, new Map(), agents)).toBeNull();
    expect(eventLogLinkForField("agentCall", agent, workflows, new Map())).toBeNull();
    const stepStarted: RunEvent = {
      type: "step_started",
      workflowRunId: "run-1",
      stepId: "step-1",
      parentStepId: null,
      name: "agent-turn",
      path: ["agent-turn"],
      runSeq: 2,
      at: AT,
      eventSchemaVersion: EVENT_SCHEMA_VERSION,
    };
    expect(eventLogLinkForField("stepId", stepStarted, new Map(), agents)).toBeNull();
  });
});

describe("eventLogLinkUnavailableReason", () => {
  const workflowLink = {
    kind: "workflow" as const,
    workflowId: "demo",
  };
  const agentLink = {
    kind: "agent" as const,
    agentId: "writer",
  };
  const workflowRunLink = {
    kind: "workflow-run" as const,
    workflowId: "demo",
    runId: "run-1",
  };
  const conversationLink = {
    kind: "conversation" as const,
    agentId: "writer",
    memoryScope: "notes",
  };
  const agentCallLink = {
    kind: "agent-call" as const,
    agentId: "writer",
    memoryScope: "notes",
    agentCallId: "call-1",
  };

  it("is null when the workflow or agent is registered", () => {
    expect(eventLogLinkUnavailableReason(workflowLink, new Set(["demo"]), new Set())).toBeNull();
    expect(eventLogLinkUnavailableReason(agentLink, new Set(), new Set(["writer"]))).toBeNull();
    expect(eventLogLinkUnavailableReason(workflowRunLink, new Set(["demo"]), new Set())).toBeNull();
    expect(
      eventLogLinkUnavailableReason(conversationLink, new Set(), new Set(["writer"])),
    ).toBeNull();
    expect(eventLogLinkUnavailableReason(agentCallLink, new Set(), new Set(["writer"]))).toBeNull();
  });

  it("explains when the target is missing from the inspector", () => {
    expect(eventLogLinkUnavailableReason(workflowLink, new Set(), new Set(["writer"]))).toBe(
      "Not registered as a top-level workflow",
    );
    expect(eventLogLinkUnavailableReason(agentLink, new Set(["demo"]), new Set())).toBe(
      "Not registered as a top-level agent",
    );
    expect(eventLogLinkUnavailableReason(workflowRunLink, new Set(), new Set())).toBe(
      "Not registered as a top-level workflow",
    );
    expect(eventLogLinkUnavailableReason(conversationLink, new Set(), new Set())).toBe(
      "Not registered as a top-level agent",
    );
    expect(eventLogLinkUnavailableReason(agentCallLink, new Set(), new Set())).toBe(
      "Not registered as a top-level agent",
    );
  });
});

function logged(logSeq: number, event: RunEvent): LoggedRunEvent {
  return { logSeq, event };
}

describe("eventLogObjectLabels", () => {
  it("keeps registry ids on workflow/agent, titles on run/conversation, and ids on calls", () => {
    const labels = eventLogObjectLabels([
      logged(1, started),
      logged(2, {
        type: "workflow_title_set",
        workflowRunId: "run-1",
        title: "What is 2+2?",
        runSeq: 2,
        at: AT,
        eventSchemaVersion: EVENT_SCHEMA_VERSION,
      }),
      logged(3, agentStarted),
      logged(4, {
        type: "agent_title_set",
        agentCallId: "call-1",
        memoryScope: "notes",
        title: "Draft notes",
        runSeq: 2,
        at: AT,
        eventSchemaVersion: EVENT_SCHEMA_VERSION,
      }),
      logged(5, {
        type: "step_started",
        workflowRunId: "run-1",
        stepId: "step-1",
        parentStepId: null,
        name: "agent-turn",
        key: "0",
        path: ["agent-turn"],
        runSeq: 3,
        at: AT,
        eventSchemaVersion: EVENT_SCHEMA_VERSION,
      }),
    ]);

    expect(labels.workflow.get("demo")).toBe("demo");
    expect(labels.workflowRun.get("run-1")).toBe("What is 2+2?");
    expect(labels.agent.get("writer")).toBe("writer");
    expect(labels.conversation.get("notes")).toBe("Draft notes");
    expect(labels.agentCall.get("call-1")).toBeUndefined();
    expect(labels.stepId.get("step-1")).toBe("agent-turn (0)");
  });

  it("fills run and conversation titles from extras without using registry ids as a fallback", () => {
    const fromLog = eventLogObjectLabels([logged(1, started), logged(2, agentStarted)], {
      runs: [{ runId: "run-1", workflowId: "demo", title: "Persisted run" }],
      sessions: [
        {
          agentCallId: "call-1",
          agentId: "writer",
          memoryScope: "notes",
          title: "Persisted chat",
        },
      ],
    });
    expect(fromLog.workflow.get("demo")).toBe("demo");
    expect(fromLog.workflowRun.get("run-1")).toBe("Persisted run");
    expect(fromLog.agent.get("writer")).toBe("writer");
    expect(fromLog.conversation.get("notes")).toBe("Persisted chat");
    expect(fromLog.agentCall.get("call-1")).toBeUndefined();

    const titled = eventLogObjectLabels(
      [
        logged(1, started),
        logged(2, {
          type: "workflow_title_set",
          workflowRunId: "run-1",
          title: "Live title",
          runSeq: 2,
          at: AT,
          eventSchemaVersion: EVENT_SCHEMA_VERSION,
        }),
      ],
      { runs: [{ runId: "run-1", workflowId: "demo", title: "Stale loader title" }] },
    );
    expect(titled.workflowRun.get("run-1")).toBe("Live title");
  });
});

describe("eventLogCellLabel", () => {
  it("keeps the raw id when no label is known", () => {
    const labels = eventLogObjectLabels([]);
    expect(
      eventLogCellLabel({ field: "workflowRun", filterValue: "run-1", display: "run-1" }, labels),
    ).toBe("run-1");
  });

  it("substitutes the display name for object id columns", () => {
    const labels = eventLogObjectLabels([
      logged(1, started),
      logged(2, {
        type: "workflow_title_set",
        workflowRunId: "run-1",
        title: "What is 2+2?",
        runSeq: 2,
        at: AT,
        eventSchemaVersion: EVENT_SCHEMA_VERSION,
      }),
    ]);
    expect(
      eventLogCellLabel({ field: "workflowRun", filterValue: "run-1", display: "run-1" }, labels),
    ).toBe("What is 2+2?");
    expect(
      eventLogCellLabel({ field: "workflow", filterValue: "demo", display: "demo" }, labels),
    ).toBe("demo");
  });

  it("substitutes the conversation title, not the agent call id", () => {
    const labels = eventLogObjectLabels([
      logged(1, agentStarted),
      logged(2, {
        type: "agent_title_set",
        agentCallId: "call-1",
        memoryScope: "notes",
        title: "Draft notes",
        runSeq: 2,
        at: AT,
        eventSchemaVersion: EVENT_SCHEMA_VERSION,
      }),
    ]);
    expect(
      eventLogCellLabel({ field: "conversation", filterValue: "notes", display: "notes" }, labels),
    ).toBe("Draft notes");
    expect(
      eventLogCellLabel({ field: "agentCall", filterValue: "call-1", display: "call-1" }, labels),
    ).toBe("call-1");
  });
});

describe("eventLogNamedFilterOptions", () => {
  it("lists workflow runs by display name with the raw id as the value", () => {
    const events = [
      logged(1, started),
      logged(2, {
        type: "workflow_title_set",
        workflowRunId: "run-1",
        title: "What is 2+2?",
        runSeq: 2,
        at: AT,
        eventSchemaVersion: EVENT_SCHEMA_VERSION,
      }),
    ];
    expect(eventLogNamedFilterOptions(events, eventLogObjectLabels(events), "workflowRun")).toEqual(
      [{ value: "run-1", label: "What is 2+2?" }],
    );
  });

  it("lists conversations by title, not agent calls", () => {
    const events = [
      logged(1, agentStarted),
      logged(2, {
        type: "agent_title_set",
        agentCallId: "call-1",
        memoryScope: "notes",
        title: "Draft notes",
        runSeq: 2,
        at: AT,
        eventSchemaVersion: EVENT_SCHEMA_VERSION,
      }),
    ];
    const labels = eventLogObjectLabels(events);
    expect(eventLogNamedFilterOptions(events, labels, "conversation")).toEqual([
      { value: "notes", label: "Draft notes" },
    ]);
    expect(eventLogNamedFilterOptions(events, labels, "agentCall")).toEqual([
      { value: "call-1", label: "call-1" },
    ]);
  });

  it("offers Not present and null when those values appear", () => {
    const events = [
      logged(1, started),
      logged(2, agentStarted),
      logged(3, {
        type: "custom",
        workflowRunId: "run-1",
        stepId: null,
        name: "root-note",
        payload: {},
        runSeq: 4,
        at: AT,
        eventSchemaVersion: EVENT_SCHEMA_VERSION,
      }),
    ];
    const labels = eventLogObjectLabels(events);
    expect(eventLogNamedFilterOptions(events, labels, "agentCall")[0]).toEqual({
      value: EVENT_LOG_FILTER_ABSENT,
      label: "Not present",
    });
    expect(eventLogNamedFilterOptions(events, labels, "stepId")).toEqual([
      { value: EVENT_LOG_FILTER_ABSENT, label: "Not present" },
      { value: "null", label: "null" },
    ]);
  });
});

describe("formatEventLogTime", () => {
  it("uses YYYY-MM-DD with local clock time and milliseconds", () => {
    const iso = "2026-08-28T15:04:05.123Z";
    const date = new Date(iso);
    const day = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0"),
    ].join("-");
    const formatted = formatEventLogTime(iso);
    expect(formatted.startsWith(`${day} `)).toBe(true);
    expect(formatted).toContain(
      date.toLocaleTimeString(undefined, {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
    );
    expect(formatted).toContain(".123");
  });

  it("returns the original string when the timestamp is invalid", () => {
    expect(formatEventLogTime("not-a-date")).toBe("not-a-date");
  });
});
