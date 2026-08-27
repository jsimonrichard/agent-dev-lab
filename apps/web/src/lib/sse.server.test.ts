import { describe, expect, it } from "bun:test";

import type { RunEvent as CoreRunEvent } from "@agent-dev-lab/core";

import {
  agentRunStreamIsTerminal,
  shouldCloseAgentConversationStream,
  workflowRunStreamIsTerminal,
} from "./sse.server";

const AT = "2026-01-01T00:00:00.000Z";

function event(type: CoreRunEvent["type"]): CoreRunEvent {
  return {
    type,
    seq: 1,
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
