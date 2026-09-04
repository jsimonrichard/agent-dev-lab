import { describe, expect, it } from "bun:test";

import { inspectAgentOutputSchema, inspectAgentStopWhen, inspectAgentTools } from "./agent-tools";

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

  it("uses a ToolProvider's listTools instead of its own getTools/contextSchema keys", () => {
    expect(
      inspectAgentTools({
        definition: {
          tools: {
            contextSchema: {},
            getTools: () => ({}),
            listTools: () => [{ name: "bash", description: "Run a shell command." }],
          },
        },
      }),
    ).toEqual([{ name: "bash", description: "Run a shell command." }]);
  });

  it("returns no tools for a ToolProvider with no listTools", () => {
    expect(
      inspectAgentTools({
        definition: {
          tools: {
            contextSchema: {},
            getTools: () => ({}),
          },
        },
      }),
    ).toEqual([]);
  });
});

describe("inspectAgentStopWhen", () => {
  it("is 'default' when the agent definition has no stopWhen", () => {
    expect(inspectAgentStopWhen({ definition: {} })).toBe("default");
  });

  it("is 'custom' when the agent definition sets its own stopWhen", () => {
    // Regression test: a project agent is constructed inside jiti's own module realm (see this
    // function's doc comment), so a naive `agent.stopWhen === DEFAULT_AGENT_STOP_WHEN` reference
    // check (comparing against this app's own import of the constant) would never match even
    // for a genuinely custom `stopWhen` — every agent would read as "custom" regardless of this
    // case. Reading `definition.stopWhen` directly sidesteps that; this only needs an
    // `undefined` check to tell the two cases apart.
    expect(inspectAgentStopWhen({ definition: { stopWhen: () => true } })).toBe("custom");
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
