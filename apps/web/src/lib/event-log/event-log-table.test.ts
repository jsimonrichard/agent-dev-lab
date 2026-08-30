import { describe, expect, it } from "bun:test";

import type { LoggedRunEvent, RunEvent } from "@agent-dev-lab/core";
import { EVENT_SCHEMA_VERSION } from "@agent-dev-lab/core";

import {
  eventLogColumnVisibility,
  eventLogFilterFieldList,
  eventLogHiddenCells,
  eventLogHiddenColumnIds,
  eventLogPresentFields,
  eventLogRowHiddenColumnIds,
  eventLogTableCell,
  eventLogTableCells,
  eventLogUserColumnVisibility,
} from "./event-log-table";

const AT = "2026-01-01T00:00:00.000Z";

function logged(logSeq: number, event: RunEvent): LoggedRunEvent {
  return { logSeq, event };
}

const workflow = logged(9, {
  type: "workflow_started",
  workflowRunId: "run-1",
  workflowId: "demo",
  input: {},
  runSeq: 1,
  at: AT,
  eventSchemaVersion: EVENT_SCHEMA_VERSION,
});

const agent = logged(10, {
  type: "agent_text_delta",
  agentCallId: "call-1",
  workflowRunId: "run-1",
  runSeq: 4,
  at: AT,
  eventSchemaVersion: EVENT_SCHEMA_VERSION,
  delta: "Hi",
});

describe("eventLogTableCell", () => {
  it("reads shared fields from the log wrapper and event", () => {
    expect(eventLogTableCell(workflow, "logSeq")).toEqual({
      field: "logSeq",
      filterValue: "9",
      display: "9",
    });
    expect(eventLogTableCell(workflow, "type")?.filterValue).toBe("workflow_started");
    expect(eventLogTableCell(workflow, "workflow")?.filterValue).toBe("demo");
    expect(eventLogTableCell(workflow, "workflowRun")?.filterValue).toBe("run-1");
    expect(eventLogTableCell(workflow, "agentCall")).toBeNull();
    expect(eventLogTableCell(workflow, "conversation")).toBeNull();
    expect(
      eventLogTableCell(
        logged(11, {
          type: "custom",
          workflowRunId: "run-1",
          stepId: null,
          name: "root-note",
          payload: {},
          runSeq: 4,
          at: AT,
          eventSchemaVersion: EVENT_SCHEMA_VERSION,
        }),
        "stepId",
      ),
    ).toEqual({ field: "stepId", filterValue: "null", display: "—" });
  });

  it("omits agent-only columns on workflow events and the reverse", () => {
    const workflowFields = eventLogTableCells(workflow).map((cell) => cell.field);
    expect(workflowFields).toEqual(["logSeq", "at", "type", "runSeq", "workflow", "workflowRun"]);

    const resolve = {
      workflowIds: new Map([["run-1", "demo"]]),
      agentSessions: new Map([["call-1", { agentId: "writer", memoryScope: "notes" }]]),
    };
    expect(eventLogTableCell(agent, "conversation", resolve)).toEqual({
      field: "conversation",
      filterValue: "notes",
      display: "notes",
    });
    const agentFields = eventLogTableCells(agent, resolve).map((cell) => cell.field);
    expect(agentFields).toEqual([
      "logSeq",
      "at",
      "type",
      "runSeq",
      "workflow",
      "workflowRun",
      "agent",
      "conversation",
      "agentCall",
    ]);
  });
});

describe("eventLogPresentFields", () => {
  it("includes only fields that appear on at least one event", () => {
    const present = eventLogPresentFields([workflow]);
    expect([...present]).toEqual(["logSeq", "at", "type", "runSeq", "workflow", "workflowRun"]);
    expect(present.has("agentCall")).toBe(false);
    expect(present.has("stepId")).toBe(false);
  });
});

describe("eventLogColumnVisibility", () => {
  it("hides sequence columns by default and columns that are not present", () => {
    const present = eventLogPresentFields([workflow, agent]);
    expect(eventLogColumnVisibility({}, present)).toMatchObject({
      logSeq: false,
      runSeq: false,
    });
    expect(eventLogColumnVisibility({ stepId: true, agentCall: false }, present)).toEqual({
      stepId: false,
      agent: false,
      conversation: false,
      agentCall: false,
      logSeq: false,
      runSeq: false,
    });
    expect(eventLogHiddenColumnIds({}, present)).toEqual(["logSeq", "runSeq"]);
    expect(eventLogHiddenColumnIds({ agentCall: false }, present)).toEqual([
      "logSeq",
      "runSeq",
      "agentCall",
    ]);
    expect(eventLogRowHiddenColumnIds(["logSeq", "runSeq", "agentCall"])).toEqual(["agentCall"]);
  });

  it("keeps a default-hidden column visible when the user opts in", () => {
    const present = eventLogPresentFields([workflow, agent]);
    expect(eventLogColumnVisibility({ logSeq: true }, present).logSeq).not.toBe(false);
    expect(
      eventLogUserColumnVisibility({ logSeq: true, runSeq: false, agentCall: false }, present),
    ).toEqual({ logSeq: true, agentCall: false });
  });

  it("stores only user-hidden columns that exist in the table", () => {
    const present = eventLogPresentFields([workflow, agent]);
    expect(
      eventLogUserColumnVisibility({ stepId: false, agentCall: false, type: true }, present),
    ).toEqual({ agentCall: false });
    expect(eventLogUserColumnVisibility(eventLogColumnVisibility({}, present), present)).toEqual(
      {},
    );
  });

  it("lists hidden cells that exist on the row", () => {
    const hidden = eventLogHiddenCells(agent, ["agentCall", "stepId"]);
    expect(hidden.map((cell) => cell.field)).toEqual(["agentCall"]);
  });
});

describe("eventLogFilterFieldList", () => {
  it("lists table columns first and aliases id fields in extras", () => {
    const list = eventLogFilterFieldList([workflow, agent]);
    expect(list.columns).toEqual([
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
    ]);
    expect(list.extra).toContain("delta");
    expect(list.extra).not.toContain("workflowRunId");
    expect(list.extra).not.toContain("agentCallId");
    expect(list.extra).not.toContain("workflowId");
    expect(list.extra).not.toContain("agentId");
    expect(list.extra).not.toContain("memoryScope");
    expect(list.extra).not.toContain("workflowRun");
    expect(list.extra).not.toContain("type");
  });

  it("lists array fields but not indexed element paths", () => {
    const list = eventLogFilterFieldList([
      logged(11, {
        type: "workflow_started",
        workflowRunId: "run-1",
        workflowId: "demo",
        input: { messages: [{ role: "user", content: "hi" }] },
        runSeq: 1,
        at: AT,
        eventSchemaVersion: EVENT_SCHEMA_VERSION,
      }),
    ]);
    expect(list.extra).toContain("input");
    expect(list.extra).toContain("input.messages");
    expect(list.extra).not.toContain("input.messages.0");
    expect(list.extra).not.toContain("input.messages.0.role");
  });
});
