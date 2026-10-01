import { describe, expect, it } from "bun:test";

import { EVENT_SCHEMA_VERSION, type RunEvent } from "./events";
import {
  computeEpisodeTiming,
  computeEpisodeTimingByAgentCallId,
  unionIntervalMs,
} from "./episode-timing";

const base = {
  eventSchemaVersion: EVENT_SCHEMA_VERSION,
  agentCallId: "ep-1",
  agentId: "researcher",
} as const;

function at(iso: string): string {
  return iso;
}

describe("unionIntervalMs", () => {
  it("sums disjoint intervals", () => {
    expect(
      unionIntervalMs([
        { startMs: 0, endMs: 100 },
        { startMs: 200, endMs: 350 },
      ]),
    ).toBe(250);
  });

  it("merges overlapping intervals", () => {
    expect(
      unionIntervalMs([
        { startMs: 0, endMs: 100 },
        { startMs: 50, endMs: 150 },
      ]),
    ).toBe(150);
  });
});

describe("computeEpisodeTiming", () => {
  it("attributes sequential tools then residual wall to LLM", () => {
    const events: RunEvent[] = [
      {
        ...base,
        type: "agent_started",
        runSeq: 1,
        at: at("2026-01-01T00:00:00.000Z"),
        memoryScope: "s",
      },
      {
        ...base,
        type: "agent_tool_call",
        runSeq: 2,
        at: at("2026-01-01T00:00:01.000Z"),
        toolCallId: "t1",
        toolName: "bash",
      },
      {
        ...base,
        type: "agent_tool_result",
        runSeq: 3,
        at: at("2026-01-01T00:00:03.000Z"),
        toolCallId: "t1",
        toolName: "bash",
        result: { ok: true },
      },
      {
        ...base,
        type: "agent_tool_call",
        runSeq: 4,
        at: at("2026-01-01T00:00:04.000Z"),
        toolCallId: "t2",
        toolName: "bash",
      },
      {
        ...base,
        type: "agent_tool_result",
        runSeq: 5,
        at: at("2026-01-01T00:00:05.000Z"),
        toolCallId: "t2",
        toolName: "bash",
        result: { ok: true },
      },
      {
        ...base,
        type: "agent_finished",
        runSeq: 6,
        at: at("2026-01-01T00:00:10.000Z"),
      },
    ];

    const timing = computeEpisodeTiming(events);
    expect(timing).toEqual({
      agentCallId: "ep-1",
      wallMs: 10_000,
      toolWaitMs: 3_000,
      llmActiveMs: 7_000,
    });
  });

  it("unions overlapping parallel tool intervals", () => {
    const events: RunEvent[] = [
      {
        ...base,
        type: "agent_started",
        runSeq: 1,
        at: at("2026-01-01T00:00:00.000Z"),
        memoryScope: "s",
      },
      {
        ...base,
        type: "agent_tool_call",
        runSeq: 2,
        at: at("2026-01-01T00:00:01.000Z"),
        toolCallId: "a",
        toolName: "bash",
      },
      {
        ...base,
        type: "agent_tool_call",
        runSeq: 3,
        at: at("2026-01-01T00:00:01.500Z"),
        toolCallId: "b",
        toolName: "bash",
      },
      {
        ...base,
        type: "agent_tool_result",
        runSeq: 4,
        at: at("2026-01-01T00:00:03.000Z"),
        toolCallId: "a",
        toolName: "bash",
        result: {},
      },
      {
        ...base,
        type: "agent_tool_result",
        runSeq: 5,
        at: at("2026-01-01T00:00:04.000Z"),
        toolCallId: "b",
        toolName: "bash",
        result: {},
      },
      {
        ...base,
        type: "agent_finished",
        runSeq: 6,
        at: at("2026-01-01T00:00:05.000Z"),
      },
    ];

    // Overlap [1.0,3.0] U [1.5,4.0] = [1.0,4.0] → 3000ms tool, wall 5000 → LLM 2000
    expect(computeEpisodeTiming(events)).toEqual({
      agentCallId: "ep-1",
      wallMs: 5_000,
      toolWaitMs: 3_000,
      llmActiveMs: 2_000,
    });
  });

  it("ignores preliminary results when closing tool intervals", () => {
    const events: RunEvent[] = [
      {
        ...base,
        type: "agent_started",
        runSeq: 1,
        at: at("2026-01-01T00:00:00.000Z"),
        memoryScope: "s",
      },
      {
        ...base,
        type: "agent_tool_call",
        runSeq: 2,
        at: at("2026-01-01T00:00:01.000Z"),
        toolCallId: "t1",
        toolName: "bash",
      },
      {
        ...base,
        type: "agent_tool_result",
        runSeq: 3,
        at: at("2026-01-01T00:00:01.500Z"),
        toolCallId: "t1",
        toolName: "bash",
        result: { stdout: "partial" },
        preliminary: true,
      },
      {
        ...base,
        type: "agent_tool_result",
        runSeq: 4,
        at: at("2026-01-01T00:00:02.000Z"),
        toolCallId: "t1",
        toolName: "bash",
        result: { stdout: "partial" },
        preliminary: true,
      },
      {
        ...base,
        type: "agent_tool_result",
        runSeq: 5,
        at: at("2026-01-01T00:00:04.000Z"),
        toolCallId: "t1",
        toolName: "bash",
        result: { stdout: "done" },
      },
      {
        ...base,
        type: "agent_finished",
        runSeq: 6,
        at: at("2026-01-01T00:00:05.000Z"),
      },
    ];

    expect(computeEpisodeTiming(events)?.toolWaitMs).toBe(3_000);
  });

  it("uses nowMs for a still-running episode", () => {
    const events: RunEvent[] = [
      {
        ...base,
        type: "agent_started",
        runSeq: 1,
        at: at("2026-01-01T00:00:00.000Z"),
        memoryScope: "s",
      },
    ];
    const nowMs = Date.parse("2026-01-01T00:00:02.000Z");
    expect(computeEpisodeTiming(events, { nowMs })).toEqual({
      agentCallId: "ep-1",
      wallMs: 2_000,
      toolWaitMs: 0,
      llmActiveMs: 2_000,
    });
  });

  it("returns null without started or wall end", () => {
    expect(computeEpisodeTiming([])).toBeNull();
    expect(
      computeEpisodeTiming([
        {
          type: "agent_started",
          at: at("2026-01-01T00:00:00.000Z"),
          agentCallId: "ep-1",
        },
      ]),
    ).toBeNull();
  });
});

describe("computeEpisodeTimingByAgentCallId", () => {
  it("groups multiple episodes", () => {
    const events: RunEvent[] = [
      {
        ...base,
        agentCallId: "ep-a",
        type: "agent_started",
        runSeq: 1,
        at: at("2026-01-01T00:00:00.000Z"),
        memoryScope: "a",
      },
      {
        ...base,
        agentCallId: "ep-a",
        type: "agent_finished",
        runSeq: 2,
        at: at("2026-01-01T00:00:01.000Z"),
      },
      {
        ...base,
        agentCallId: "ep-b",
        type: "agent_started",
        runSeq: 3,
        at: at("2026-01-01T00:00:02.000Z"),
        memoryScope: "b",
      },
      {
        ...base,
        agentCallId: "ep-b",
        type: "agent_finished",
        runSeq: 4,
        at: at("2026-01-01T00:00:05.000Z"),
      },
    ];
    const map = computeEpisodeTimingByAgentCallId(events);
    expect(map.get("ep-a")?.wallMs).toBe(1_000);
    expect(map.get("ep-b")?.wallMs).toBe(3_000);
  });
});
