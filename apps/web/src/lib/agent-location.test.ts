import { describe, expect, it } from "bun:test";

import { agentRunSearch, parseAgentLocation, parseAgentRunSearch } from "./agent-location";

describe("parseAgentLocation", () => {
  it("reads agent and conversation ids from the path", () => {
    expect(parseAgentLocation("/agent/writer/run/notes")).toEqual({
      agentId: "writer",
      runId: "notes",
    });
    expect(parseAgentLocation("/agent/writer")).toEqual({ agentId: "writer" });
    expect(parseAgentLocation("/events")).toEqual({});
  });
});

describe("parseAgentRunSearch", () => {
  it("keeps a non-empty call id", () => {
    expect(parseAgentRunSearch({ call: "call-1", extra: 1 })).toEqual({ call: "call-1" });
  });

  it("drops empty or non-string values", () => {
    expect(parseAgentRunSearch({ call: "" })).toEqual({});
    expect(parseAgentRunSearch({ call: 2 })).toEqual({});
  });
});

describe("agentRunSearch", () => {
  it("omits empty selection fields", () => {
    expect(agentRunSearch({})).toEqual({});
    expect(agentRunSearch({ call: null })).toEqual({});
    expect(agentRunSearch({ call: "call-1" })).toEqual({ call: "call-1" });
  });
});
