import { describe, expect, it } from "bun:test";

import type { LoggedRunEvent, RunEvent } from "@agent-dev-lab/core";
import { EVENT_SCHEMA_VERSION } from "@agent-dev-lab/core";

import {
  HIDE_TEXT_DELTA_CLAUSE,
  collectFieldKinds,
  collectFieldPaths,
  createFilterClause,
  eventLogEnumFilterOptions,
  eventLogFilterCellValue,
  eventLogFilterFieldKind,
  eventLogFilterOpsForField,
  eventMatchesFilters,
  filterLoggedEvents,
  flattenLoggedEvent,
  formatFilterClause,
  isEventLogFilterOpAllowed,
} from "./event-log-filter";
import { EVENT_LOG_FILTER_ABSENT, eventLogObjectLabels } from "./event-log-summary";

const AT = "2026-01-01T00:00:00.000Z";

function logged(logSeq: number, event: RunEvent): LoggedRunEvent {
  return { logSeq, event };
}

function customEvent(): RunEvent {
  return {
    type: "custom",
    workflowRunId: "run-1",
    runSeq: 3,
    at: AT,
    eventSchemaVersion: EVENT_SCHEMA_VERSION,
    name: "answer-ready",
    payload: { turns: 2, nested: { ok: true } },
  };
}

function started(): RunEvent {
  return {
    type: "workflow_started",
    workflowRunId: "run-1",
    workflowId: "answer-question",
    input: { question: "hello" },
    runSeq: 1,
    at: AT,
    eventSchemaVersion: EVENT_SCHEMA_VERSION,
  };
}

function startedWithMessages(): RunEvent {
  return {
    type: "workflow_started",
    workflowRunId: "run-1",
    workflowId: "literature-review",
    input: {
      messages: [
        { role: "user", content: "hi" },
        { role: "assistant", content: [{ input: { topic: "quasars" } }] },
      ],
    },
    runSeq: 1,
    at: AT,
    eventSchemaVersion: EVENT_SCHEMA_VERSION,
  };
}

function delta(): RunEvent {
  return {
    type: "agent_text_delta",
    agentCallId: "call-1",
    workflowRunId: "run-1",
    runSeq: 4,
    at: AT,
    eventSchemaVersion: EVENT_SCHEMA_VERSION,
    delta: "Hello",
  };
}

describe("flattenLoggedEvent", () => {
  it("includes logSeq, top-level fields, and nested JSON paths", () => {
    const fields = flattenLoggedEvent(logged(9, customEvent()));
    expect(fields.logSeq).toBe("9");
    expect(fields.type).toBe("custom");
    expect(fields.workflowRunId).toBe("run-1");
    expect(fields.workflowRun).toBe("run-1");
    expect(fields.name).toBe("answer-ready");
    expect(fields["payload.turns"]).toBe("2");
    expect(fields["payload.nested.ok"]).toBe("true");
  });
});

describe("collectFieldPaths", () => {
  it("unions keys across events and aliases id columns", () => {
    const keys = collectFieldPaths([logged(1, started()), logged(2, customEvent())]);
    expect(keys.slice(0, 6)).toEqual(["logSeq", "at", "type", "runSeq", "workflow", "workflowRun"]);
    expect(keys).toContain("payload.turns");
    expect(keys).toContain("input.question");
    expect(keys).not.toContain("workflowRunId");
    expect(keys).not.toContain("agentCallId");
    expect(keys).not.toContain("workflowId");
    expect(keys).not.toContain("agentId");
    expect(keys).not.toContain("memoryScope");
  });

  it("lists array fields but omits indexed element paths", () => {
    const keys = collectFieldPaths([logged(1, startedWithMessages())]);
    expect(keys).toContain("input");
    expect(keys).toContain("input.messages");
    expect(keys).not.toContain("input.messages.0");
    expect(keys).not.toContain("input.messages.0.role");
    expect(keys).not.toContain("input.messages.1.content.0.input.topic");
  });
});

describe("eventMatchesFilters", () => {
  it("ANDs clauses and matches nested payload fields", () => {
    const entry = logged(1, customEvent());
    expect(
      eventMatchesFilters(entry, {
        query: "",
        clauses: [
          createFilterClause({ id: "a", field: "type", op: "equals", value: "custom" }),
          createFilterClause({ id: "b", field: "payload.turns", op: "equals", value: "2" }),
        ],
      }),
    ).toBe(true);
    expect(
      eventMatchesFilters(entry, {
        query: "",
        clauses: [
          createFilterClause({ id: "a", field: "type", op: "equals", value: "custom" }),
          createFilterClause({ id: "b", field: "payload.turns", op: "equals", value: "9" }),
        ],
      }),
    ).toBe(false);
  });

  it("treats a missing field as a failed equals and a passed not-equals", () => {
    const entry = logged(1, started());
    expect(
      eventMatchesFilters(entry, {
        query: "",
        clauses: [createFilterClause({ field: "agentId", op: "equals", value: "writer" })],
      }),
    ).toBe(false);
    expect(
      eventMatchesFilters(entry, {
        query: "",
        clauses: [createFilterClause({ field: "agentId", op: "not-equals", value: "writer" })],
      }),
    ).toBe(true);
  });

  it("matches free-text against any flattened field", () => {
    const entry = logged(1, started());
    expect(eventMatchesFilters(entry, { query: "answer-question", clauses: [] })).toBe(true);
    expect(eventMatchesFilters(entry, { query: "not-in-event", clauses: [] })).toBe(false);
  });

  it("hides agent_text_delta with the default clause", () => {
    const events = [logged(1, started()), logged(2, delta())];
    const visible = filterLoggedEvents(events, { query: "", clauses: [HIDE_TEXT_DELTA_CLAUSE] });
    expect(visible.map((entry) => entry.event.type)).toEqual(["workflow_started"]);
  });

  it("matches the conversation alias against a resolved memory scope", () => {
    const resolve = {
      workflowIds: new Map([["run-1", "answer-question"]]),
      agentSessions: new Map([["call-1", { agentId: "writer", memoryScope: "notes" }]]),
    };
    const entry = logged(1, delta());
    expect(
      eventMatchesFilters(
        entry,
        {
          query: "",
          clauses: [createFilterClause({ field: "conversation", op: "equals", value: "notes" })],
        },
        undefined,
        resolve,
      ),
    ).toBe(true);
    expect(
      eventMatchesFilters(
        entry,
        {
          query: "",
          clauses: [createFilterClause({ field: "agentCall", op: "equals", value: "call-1" })],
        },
        undefined,
        resolve,
      ),
    ).toBe(true);
  });

  it("matches the workflowRun alias against the raw run id", () => {
    const entry = logged(1, started());
    expect(
      eventMatchesFilters(entry, {
        query: "",
        clauses: [createFilterClause({ field: "workflowRun", op: "equals", value: "run-1" })],
      }),
    ).toBe(true);
    expect(
      eventMatchesFilters(entry, {
        query: "",
        clauses: [createFilterClause({ field: "workflowRun", op: "equals", value: "other" })],
      }),
    ).toBe(false);
  });

  it("does not apply contains to enum or numeric fields", () => {
    const startedEntry = logged(1, started());
    const customEntry = logged(2, customEvent());
    expect(
      eventMatchesFilters(startedEntry, {
        query: "",
        clauses: [createFilterClause({ field: "workflow", op: "contains", value: "answer" })],
      }),
    ).toBe(false);
    expect(
      eventMatchesFilters(startedEntry, {
        query: "",
        clauses: [
          createFilterClause({ field: "workflow", op: "equals", value: "answer-question" }),
        ],
      }),
    ).toBe(true);
    expect(
      eventMatchesFilters(customEntry, {
        query: "",
        clauses: [createFilterClause({ field: "payload.turns", op: "contains", value: "2" })],
      }),
    ).toBe(false);
    expect(
      eventMatchesFilters(startedEntry, {
        query: "",
        clauses: [createFilterClause({ field: "input.question", op: "contains", value: "ell" })],
      }),
    ).toBe(true);
  });

  it("matches is-not-empty and treats empty objects and arrays as empty", () => {
    const withInput = logged(1, started());
    const emptyPayload = logged(2, {
      type: "custom",
      workflowRunId: "run-1",
      name: "root-note",
      payload: {},
      runSeq: 4,
      at: AT,
      eventSchemaVersion: EVENT_SCHEMA_VERSION,
    });
    const withMessages = logged(3, startedWithMessages());
    expect(
      eventMatchesFilters(withInput, {
        query: "",
        clauses: [createFilterClause({ field: "input", op: "is-not-empty", value: "" })],
      }),
    ).toBe(true);
    expect(
      eventMatchesFilters(emptyPayload, {
        query: "",
        clauses: [createFilterClause({ field: "payload", op: "is-empty", value: "" })],
      }),
    ).toBe(true);
    expect(
      eventMatchesFilters(emptyPayload, {
        query: "",
        clauses: [createFilterClause({ field: "payload", op: "exists", value: "" })],
      }),
    ).toBe(true);
    expect(
      eventMatchesFilters(withMessages, {
        query: "",
        clauses: [createFilterClause({ field: "input.messages", op: "is-not-empty", value: "" })],
      }),
    ).toBe(true);
    expect(
      eventMatchesFilters(withInput, {
        query: "",
        clauses: [createFilterClause({ field: "input.messages", op: "is-empty", value: "" })],
      }),
    ).toBe(true);
  });

  it("matches omitted fields as Not present and JSON null as null", () => {
    const missing = logged(1, started());
    const nulled = logged(2, {
      type: "custom",
      workflowRunId: "run-1",
      stepId: null,
      name: "root-note",
      payload: {},
      runSeq: 4,
      at: AT,
      eventSchemaVersion: EVENT_SCHEMA_VERSION,
    });
    expect(
      eventMatchesFilters(missing, {
        query: "",
        clauses: [
          createFilterClause({ field: "stepId", op: "equals", value: EVENT_LOG_FILTER_ABSENT }),
        ],
      }),
    ).toBe(true);
    expect(
      eventMatchesFilters(nulled, {
        query: "",
        clauses: [
          createFilterClause({ field: "stepId", op: "equals", value: EVENT_LOG_FILTER_ABSENT }),
        ],
      }),
    ).toBe(false);
    expect(
      eventMatchesFilters(nulled, {
        query: "",
        clauses: [createFilterClause({ field: "stepId", op: "equals", value: "null" })],
      }),
    ).toBe(true);
    expect(
      eventMatchesFilters(missing, {
        query: "",
        clauses: [createFilterClause({ field: "stepId", op: "equals", value: "null" })],
      }),
    ).toBe(false);
    expect(eventLogFilterCellValue(missing, "stepId")).toBe(EVENT_LOG_FILTER_ABSENT);
    expect(eventLogFilterCellValue(nulled, "stepId")).toBe("null");
  });
});

describe("eventLogFilterFieldKind", () => {
  it("treats workflow and other closed ids as enums, not strings", () => {
    expect(eventLogFilterFieldKind("workflow")).toBe("enum");
    expect(eventLogFilterFieldKind("workflowId")).toBe("enum");
    expect(eventLogFilterFieldKind("type")).toBe("enum");
    expect(eventLogFilterFieldKind("agent")).toBe("enum");
    expect(eventLogFilterFieldKind("logSeq")).toBe("number");
    expect(eventLogFilterFieldKind("at")).toBe("datetime");
    expect(eventLogFilterFieldKind("input.question")).toBe("string");
  });

  it("infers extra payload fields from observed values", () => {
    const kinds = collectFieldKinds([logged(1, started()), logged(2, customEvent())]);
    expect(kinds.workflow).toBe("enum");
    expect(kinds["input.question"]).toBe("string");
    expect(kinds["payload.turns"]).toBe("number");
    expect(kinds.input).toBe("object");
    expect(kinds.payload).toBe("object");
    expect(kinds["payload.nested"]).toBe("object");
    expect(kinds["payload.nested.ok"]).toBe("boolean");
    expect(collectFieldKinds([logged(1, startedWithMessages())])["input.messages"]).toBe("array");
  });

  it("omits contains for non-string fields", () => {
    expect(eventLogFilterOpsForField("workflow").map((item) => item.op)).not.toContain("contains");
    expect(eventLogFilterOpsForField("type").map((item) => item.op)).not.toContain("contains");
    expect(isEventLogFilterOpAllowed("workflow", "contains")).toBe(false);
    expect(isEventLogFilterOpAllowed("input.question", "contains")).toBe(true);
    expect(
      isEventLogFilterOpAllowed("payload.turns", "contains", { "payload.turns": "number" }),
    ).toBe(false);
  });

  it("limits objects and arrays to existence operators", () => {
    const objectOps = eventLogFilterOpsForField("input", { input: "object" }).map(
      (item) => item.op,
    );
    const arrayOps = eventLogFilterOpsForField("input.messages", {
      "input.messages": "array",
    }).map((item) => item.op);
    expect(objectOps).toEqual(["exists", "is-empty", "is-not-empty"]);
    expect(arrayOps).toEqual(["exists", "is-empty", "is-not-empty"]);
    expect(isEventLogFilterOpAllowed("input", "equals", { input: "object" })).toBe(false);
    expect(eventLogFilterOpsForField("delta").map((item) => item.op)).toContain("is-not-empty");
  });
});

describe("eventLogEnumFilterOptions", () => {
  it("lists observed event types for the type field", () => {
    const events = [logged(1, started()), logged(2, customEvent())];
    expect(eventLogEnumFilterOptions(events, "type", eventLogObjectLabels(events))).toEqual([
      { value: "custom", label: "custom" },
      { value: "workflow_started", label: "workflow_started" },
    ]);
  });

  it("returns null for free-text fields", () => {
    const events = [logged(1, started())];
    expect(
      eventLogEnumFilterOptions(events, "input.question", eventLogObjectLabels(events)),
    ).toBeNull();
  });
});

describe("formatFilterClause", () => {
  it("uses aliased column names and optional display values", () => {
    expect(
      formatFilterClause(
        createFilterClause({ field: "workflowRunId", op: "equals", value: "run-1" }),
        "What is 2+2?",
      ),
    ).toBe("workflowRun equals What is 2+2?");
    expect(
      formatFilterClause(
        createFilterClause({ field: "type", op: "not-equals", value: "agent_text_delta" }),
      ),
    ).toBe("type not equals agent_text_delta");
    expect(
      formatFilterClause(
        createFilterClause({ field: "stepId", op: "equals", value: EVENT_LOG_FILTER_ABSENT }),
      ),
    ).toBe("stepId equals Not present");
    expect(
      formatFilterClause(createFilterClause({ field: "input", op: "is-not-empty", value: "" })),
    ).toBe("input is not empty");
  });
});
