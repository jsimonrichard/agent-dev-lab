import { describe, expect, it } from "bun:test";

import { EVENT_SCHEMA_VERSION, type RunEvent } from "@agent-dev-lab/core";

import { foldPreliminaryToolResult } from "./preliminary-tool-results";

const base = {
  eventSchemaVersion: EVENT_SCHEMA_VERSION,
  agentCallId: "ep-1",
  agentId: "researcher",
  toolName: "bash",
  runSeq: 1,
  at: "2026-01-01T00:00:00.000Z",
} as const;

describe("foldPreliminaryToolResult", () => {
  it("stores preliminary payloads and clears on final", () => {
    let map = new Map<string, unknown>();
    const prelim: RunEvent = {
      ...base,
      type: "agent_tool_result",
      toolCallId: "t1",
      result: { stdout: "hi" },
      preliminary: true,
    };
    map = foldPreliminaryToolResult(map, prelim);
    expect(map.get("t1")).toEqual({ stdout: "hi" });

    map = foldPreliminaryToolResult(map, {
      ...prelim,
      runSeq: 2,
      result: { stdout: "hi\nthere" },
    });
    expect(map.get("t1")).toEqual({ stdout: "hi\nthere" });

    map = foldPreliminaryToolResult(map, {
      ...prelim,
      runSeq: 3,
      result: { stdout: "hi\nthere" },
      preliminary: undefined,
    });
    expect(map.has("t1")).toBe(false);
  });

  it("ignores unrelated events", () => {
    const prev = new Map([["t1", { ok: true }]]);
    const next = foldPreliminaryToolResult(prev, {
      ...base,
      type: "agent_text_delta",
      delta: "x",
    });
    expect(next).toBe(prev);
  });
});
