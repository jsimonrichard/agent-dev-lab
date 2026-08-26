import { describe, expect, it } from "bun:test";

import { agentCallMessageRange, lastMessageIdForAgentCall } from "./agent-call-focus";

const messages = [
  { id: "sys", role: "system" as const },
  { id: "user-1", role: "user" as const },
  { id: "asst-1", role: "assistant" as const },
  { id: "user-2", role: "user" as const },
  { id: "asst-2", role: "assistant" as const },
];

describe("lastMessageIdForAgentCall", () => {
  it("indexes the last message of the call from the commit total", () => {
    expect(
      lastMessageIdForAgentCall(messages, [{ type: "agent_messages_committed", total: 3 }]),
    ).toBe("asst-1");
  });

  it("uses the last commit when a call committed more than once", () => {
    expect(
      lastMessageIdForAgentCall(messages, [
        { type: "agent_messages_committed", total: 2 },
        { type: "agent_messages_committed", total: 3 },
      ]),
    ).toBe("asst-1");
  });

  it("falls back to the last message when the total is past the loaded transcript", () => {
    expect(
      lastMessageIdForAgentCall([{ id: "only" }], [{ type: "agent_messages_committed", total: 9 }]),
    ).toBe("only");
  });

  it("returns undefined when there is no commit unless fallback is requested", () => {
    expect(lastMessageIdForAgentCall(messages, [{ type: "agent_started" }])).toBeUndefined();
    expect(
      lastMessageIdForAgentCall(messages, [{ type: "agent_started" }], { fallbackToLast: true }),
    ).toBe("asst-2");
  });
});

describe("agentCallMessageRange", () => {
  it("includes the user turn before the first committed model messages", () => {
    expect(
      agentCallMessageRange(messages, [{ type: "agent_messages_committed", total: 3, count: 1 }]),
    ).toEqual({ startIndex: 1, endIndex: 2 });
  });

  it("starts at the later user turn for a subsequent call on the same scope", () => {
    expect(
      agentCallMessageRange(messages, [{ type: "agent_messages_committed", total: 5, count: 1 }]),
    ).toEqual({ startIndex: 3, endIndex: 4 });
  });

  it("does not include a pinned system message even when count covers it", () => {
    expect(
      agentCallMessageRange(messages, [{ type: "agent_messages_committed", total: 3, count: 2 }]),
    ).toEqual({ startIndex: 1, endIndex: 2 });
  });

  it("does not swallow the previous assistant turn when this call has no user message", () => {
    const continuation = [
      { id: "user-1", role: "user" as const },
      { id: "asst-1", role: "assistant" as const },
      { id: "asst-2", role: "assistant" as const },
    ];
    expect(
      agentCallMessageRange(continuation, [
        { type: "agent_messages_committed", total: 3, count: 1 },
      ]),
    ).toEqual({ startIndex: 2, endIndex: 2 });
  });

  it("uses the first commit to find the start when a call committed more than once", () => {
    expect(
      agentCallMessageRange(messages, [
        { type: "agent_messages_committed", total: 4, count: 1 },
        { type: "agent_messages_committed", total: 5, count: 1 },
      ]),
    ).toEqual({ startIndex: 3, endIndex: 4 });
  });

  it("falls back to the last user turn when streaming with no commits yet", () => {
    expect(
      agentCallMessageRange(messages, [{ type: "agent_started" }], { fallbackToLast: true }),
    ).toEqual({ startIndex: 3, endIndex: 4 });
  });
});
