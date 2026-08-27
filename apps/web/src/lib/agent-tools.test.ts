import { describe, expect, it } from "bun:test";

import { inspectAgentOutputSchema, inspectAgentTools } from "./agent-tools";

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

  it("falls back to provider tool id when description is missing", () => {
    expect(
      inspectAgentTools({
        definition: {
          tools: {
            web_search: { type: "provider-defined", id: "openai.web_search", name: "web_search" },
          },
        },
      }),
    ).toEqual([{ name: "web_search", description: "openai.web_search" }]);
  });
});

describe("inspectAgentOutputSchema", () => {
  it("describes a structured output schema from the agent definition", () => {
    expect(
      inspectAgentOutputSchema({
        definition: {
          outputSchema: {
            _def: {
              typeName: "ZodObject",
              shape: {
                title: { _def: { typeName: "ZodString" } },
                score: { _def: { typeName: "ZodNumber" } },
              },
            },
          },
        },
      }),
    ).toBe("{ title: string, score: number }");
  });

  it("returns null when the agent has no output schema", () => {
    expect(inspectAgentOutputSchema({ id: "researcher" })).toBeNull();
  });
});
