import { describe, expect, it } from "bun:test";

import { EVENT_SCHEMA_VERSION, type RunEvent as CoreRunEvent } from "@agent-dev-lab/core";

import {
  agentRunStreamIsTerminal,
  encodeLoggedRunEventSse,
  shouldCloseAgentConversationStream,
  shouldCloseWorkflowRunStream,
  workflowRunStreamIsTerminal,
} from "./sse.server";

const AT = "2026-01-01T00:00:00.000Z";

function event(type: CoreRunEvent["type"]): CoreRunEvent {
  return {
    type,
    runSeq: 1,
    at: AT,
    eventSchemaVersion: 1,
    workflowRunId: "run-1",
  } as CoreRunEvent;
}

describe("workflowRunStreamIsTerminal", () => {
  it("does not end the stream when one of several in-step agents finishes", () => {
    expect(workflowRunStreamIsTerminal(event("agent_finished"))).toBe(false);
    expect(workflowRunStreamIsTerminal(event("agent_failed"))).toBe(false);
    expect(workflowRunStreamIsTerminal(event("agent_text_delta"))).toBe(false);
  });

  it("ends only on workflow lifecycle", () => {
    expect(workflowRunStreamIsTerminal(event("workflow_finished"))).toBe(true);
    expect(workflowRunStreamIsTerminal(event("workflow_failed"))).toBe(true);
    expect(workflowRunStreamIsTerminal(event("workflow_cancelled"))).toBe(true);
  });
});

describe("shouldCloseWorkflowRunStream", () => {
  it("closes after a terminal event was delivered", () => {
    expect(
      shouldCloseWorkflowRunStream({
        sawTerminalEvent: true,
        eventBatchEmpty: false,
        runStatus: "cancelled",
      }),
    ).toBe(true);
  });

  it("stays open when status settled mid-batch before workflow_cancelled", () => {
    expect(
      shouldCloseWorkflowRunStream({
        sawTerminalEvent: false,
        eventBatchEmpty: false,
        runStatus: "cancelled",
      }),
    ).toBe(false);
  });

  it("closes when caught up and the run is no longer running", () => {
    expect(
      shouldCloseWorkflowRunStream({
        sawTerminalEvent: false,
        eventBatchEmpty: true,
        runStatus: "cancelled",
      }),
    ).toBe(true);
    expect(
      shouldCloseWorkflowRunStream({
        sawTerminalEvent: false,
        eventBatchEmpty: true,
        runStatus: "completed",
      }),
    ).toBe(true);
  });

  it("stays open while the run is still running", () => {
    expect(
      shouldCloseWorkflowRunStream({
        sawTerminalEvent: false,
        eventBatchEmpty: true,
        runStatus: "running",
      }),
    ).toBe(false);
  });
});

describe("agentRunStreamIsTerminal", () => {
  it("ends when the standalone episode settles", () => {
    expect(agentRunStreamIsTerminal(event("agent_finished"))).toBe(true);
    expect(agentRunStreamIsTerminal(event("agent_failed"))).toBe(true);
    expect(agentRunStreamIsTerminal(event("workflow_finished"))).toBe(false);
  });
});
describe("shouldCloseAgentConversationStream", () => {
  it("stays open after an episode finishes while the tool loop is still running", () => {
    expect(
      shouldCloseAgentConversationStream({
        sawTerminalEvent: true,
        conversationTurnActive: true,
      }),
    ).toBe(false);
  });

  it("closes when the episode settled and no further run is queued", () => {
    expect(
      shouldCloseAgentConversationStream({
        sawTerminalEvent: true,
        conversationTurnActive: false,
      }),
    ).toBe(true);
  });

  it("stays open while the current episode is still streaming", () => {
    expect(
      shouldCloseAgentConversationStream({
        sawTerminalEvent: false,
        conversationTurnActive: false,
      }),
    ).toBe(false);
  });
});

describe("encodeLoggedRunEventSse", () => {
  it("uses logSeq as the SSE id and JSON-encodes the logged entry", () => {
    const entry = {
      logSeq: 7,
      event: {
        type: "workflow_started",
        workflowRunId: "run-1",
        workflowId: "demo",
        input: { n: 1 },
        runSeq: 1,
        at: AT,
        eventSchemaVersion: EVENT_SCHEMA_VERSION,
      },
    };
    expect(encodeLoggedRunEventSse(entry)).toBe(`id: 7\ndata: ${JSON.stringify(entry)}\n\n`);
  });
});
