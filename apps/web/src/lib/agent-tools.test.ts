import { describe, expect, it } from "bun:test";

import { inspectAgentTools } from "./agent-tools";

describe("inspectAgentTools", () => {
  it("merges runtime tools with agent tools, preferring the agent", () => {
    expect(
      inspectAgentTools({
        services: {
          tools: {
            shared: { description: "runtime" },
            search: { description: "runtime search" },
          },
        },
        definition: {
          tools: {
            search: { description: "agent search" },
            notes: { description: "take notes" },
          },
        },
      }),
    ).toEqual([
      { name: "shared", description: "runtime" },
      { name: "search", description: "agent search" },
      { name: "notes", description: "take notes" },
    ]);
  });

  it("returns an empty list when the agent has no inspectable tools", () => {
    expect(inspectAgentTools({ id: "researcher" })).toEqual([]);
  });
});
