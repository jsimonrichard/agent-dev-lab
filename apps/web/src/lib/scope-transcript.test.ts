import { describe, expect, it } from "bun:test";

import type { MockMessage, RunEvent } from "./mock/types";
import { partitionScopeTranscript, splitTranscriptTurns } from "./scope-transcript";

const AT = "2026-01-01T00:00:00.000Z";

function msg(id: string, role: MockMessage["role"], content: string): MockMessage {
  return { id, role, content };
}

function started(seq: number, episodeId: string, scope = "notes"): RunEvent {
  return {
    seq,
    runId: "run-1",
    type: "agent_started",
    at: AT,
    stepId: `step-${episodeId}`,
    agentId: "researcher",
    memoryScope: scope,
    episodeId,
  };
}

function committed(
  seq: number,
  episodeId: string,
  total: number,
  messageCount = 1,
  scope = "notes",
): RunEvent {
  return {
    seq,
    runId: "run-1",
    type: "messages_committed",
    at: AT,
    stepId: `step-${episodeId}`,
    memoryScope: scope,
    episodeId,
    messageCount,
    total,
  };
}

const transcript = [
  msg("u1", "user", "search"),
  msg("a1", "assistant", "found papers"),
  msg("u2", "user", "write briefing"),
  msg("a2", "assistant", "briefing"),
  msg("u3", "user", "summarize"),
  msg("a3", "assistant", "summary"),
];

describe("splitTranscriptTurns", () => {
  it("keeps tool follow-through in the same turn as the preceding user message", () => {
    expect(
      splitTranscriptTurns([
        msg("u1", "user", "search"),
        msg("a1", "assistant", "calling"),
        msg("t1", "tool", "hits"),
        msg("a2", "assistant", "done"),
        msg("u2", "user", "next"),
      ]).map((turn) => turn.map((message) => message.id)),
    ).toEqual([["u1", "a1", "t1", "a2"], ["u2"]]);
  });
});

describe("partitionScopeTranscript", () => {
  it("puts a single-call transcript entirely in the current turn", () => {
    expect(
      partitionScopeTranscript(
        transcript.slice(0, 2),
        [started(1, "ep-1"), committed(2, "ep-1", 2)],
        { episodeId: "ep-1", memoryScope: "notes" },
      ),
    ).toEqual({
      prior: [],
      current: transcript.slice(0, 2),
      later: [],
    });
  });

  it("hides later calls when inspecting the first episode", () => {
    const events = [
      started(1, "ep-1"),
      committed(2, "ep-1", 2),
      started(3, "ep-2"),
      committed(4, "ep-2", 4),
      started(5, "ep-3"),
      committed(6, "ep-3", 6),
    ];
    expect(
      partitionScopeTranscript(transcript, events, { episodeId: "ep-1", memoryScope: "notes" }),
    ).toEqual({
      prior: [],
      current: transcript.slice(0, 2),
      later: transcript.slice(2),
    });
  });

  it("keeps earlier calls as context when inspecting a later episode", () => {
    const events = [
      started(1, "ep-1"),
      committed(2, "ep-1", 2),
      started(3, "ep-2"),
      committed(4, "ep-2", 4),
      started(5, "ep-3"),
      committed(6, "ep-3", 6),
    ];
    expect(
      partitionScopeTranscript(transcript, events, { episodeId: "ep-2", memoryScope: "notes" }),
    ).toEqual({
      prior: transcript.slice(0, 2),
      current: transcript.slice(2, 4),
      later: transcript.slice(4),
    });
  });

  it("treats uncommitted messages as prior context for a running later episode", () => {
    const events = [started(1, "ep-1"), committed(2, "ep-1", 2), started(3, "ep-2")];
    expect(
      partitionScopeTranscript(transcript.slice(0, 2), events, {
        episodeId: "ep-2",
        memoryScope: "notes",
      }),
    ).toEqual({
      prior: transcript.slice(0, 2),
      current: [],
      later: [],
    });
  });

  it("ignores agent calls on other memory scopes", () => {
    const events = [
      started(1, "ep-other", "critique"),
      committed(2, "ep-other", 99, 1, "critique"),
      started(3, "ep-1"),
      committed(4, "ep-1", 2),
      started(5, "ep-2"),
      committed(6, "ep-2", 4),
    ];
    expect(
      partitionScopeTranscript(transcript.slice(0, 4), events, {
        episodeId: "ep-1",
        memoryScope: "notes",
      }),
    ).toEqual({
      prior: [],
      current: transcript.slice(0, 2),
      later: transcript.slice(2, 4),
    });
  });

  it("uses commit totals when one call includes extra user messages", () => {
    const messages = [
      msg("u1a", "user", "first"),
      msg("u1b", "user", "also"),
      msg("a1", "assistant", "ok"),
      msg("u2", "user", "next"),
      msg("a2", "assistant", "done"),
    ];
    const events = [
      started(1, "ep-1"),
      committed(2, "ep-1", 3, 1),
      started(3, "ep-2"),
      committed(4, "ep-2", 5, 1),
    ];
    expect(
      partitionScopeTranscript(messages, events, { episodeId: "ep-1", memoryScope: "notes" }),
    ).toEqual({
      prior: [],
      current: messages.slice(0, 3),
      later: messages.slice(3),
    });
  });

  it("falls back to user-turn splitting when commit totals are missing", () => {
    const events: RunEvent[] = [
      started(1, "ep-1"),
      {
        seq: 2,
        runId: "run-1",
        type: "messages_committed",
        at: AT,
        stepId: "step-ep-1",
        memoryScope: "notes",
        episodeId: "ep-1",
        messageCount: 1,
      },
      started(3, "ep-2"),
      {
        seq: 4,
        runId: "run-1",
        type: "messages_committed",
        at: AT,
        stepId: "step-ep-2",
        memoryScope: "notes",
        episodeId: "ep-2",
        messageCount: 1,
      },
    ];
    expect(
      partitionScopeTranscript(transcript.slice(0, 4), events, {
        episodeId: "ep-1",
        memoryScope: "notes",
      }),
    ).toEqual({
      prior: [],
      current: transcript.slice(0, 2),
      later: transcript.slice(2, 4),
    });
  });

  it("adjusts commit totals when the transcript omits a pinned system message", () => {
    const events = [
      started(1, "ep-1"),
      committed(2, "ep-1", 3),
      started(3, "ep-2"),
      committed(4, "ep-2", 5),
    ];
    expect(
      partitionScopeTranscript(
        transcript.slice(0, 4),
        events,
        {
          episodeId: "ep-2",
          memoryScope: "notes",
        },
        { commitTotalOffset: 1 },
      ),
    ).toEqual({
      prior: transcript.slice(0, 2),
      current: transcript.slice(2, 4),
      later: [],
    });
  });
});
