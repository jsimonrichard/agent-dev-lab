import { describe, expect, it } from "bun:test";

import {
  buildToolProviderContextInput,
  inspectAgentOutputSchema,
  inspectAgentStopWhen,
  inspectAgentTools,
  inspectAgentToolProviderContext,
  seedToolProviderContextForm,
} from "./agent-tools";

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

describe("inspectAgentToolProviderContext", () => {
  it("is not declared for a plain ToolSet", () => {
    expect(
      inspectAgentToolProviderContext({
        definition: { tools: { search: { description: "search" } } },
      }),
    ).toEqual({ declared: false, fields: [] });
  });

  it("declares a ToolProvider with no contextSchema as raw JSON", () => {
    expect(
      inspectAgentToolProviderContext({
        definition: {
          tools: { getTools: () => ({}) },
        },
      }),
    ).toEqual({ declared: true, fields: [] });
  });

  it("describes object fields from a ToolProvider contextSchema", () => {
    expect(
      inspectAgentToolProviderContext({
        definition: {
          tools: {
            getTools: () => ({}),
            contextSchema: {
              _def: {
                typeName: "ZodObject",
                shape: {
                  projectPath: { _def: { typeName: "ZodString" } },
                },
              },
            },
          },
        },
      }),
    ).toEqual({
      declared: true,
      fields: [
        {
          name: "projectPath",
          kind: "string",
          required: true,
          description: undefined,
          options: undefined,
        },
      ],
    });
  });

  it("prefers definition.tools schema over runtime tools", () => {
    const inspected = inspectAgentToolProviderContext({
      services: {
        tools: {
          getTools: () => ({}),
          contextSchema: {
            _def: {
              typeName: "ZodObject",
              shape: { apiKey: { _def: { typeName: "ZodString" } } },
            },
          },
        },
      },
      definition: {
        tools: {
          getTools: () => ({}),
          contextSchema: {
            _def: {
              typeName: "ZodObject",
              shape: { projectPath: { _def: { typeName: "ZodString" } } },
            },
          },
        },
      },
    });
    expect(inspected.fields.map((field) => field.name)).toEqual(["projectPath"]);
  });
});

describe("buildToolProviderContextInput", () => {
  it("omits context when the agent has no ToolProvider", () => {
    expect(
      buildToolProviderContextInput({
        declared: false,
        fields: [],
        values: {},
        rawJson: '{"x":1}',
      }),
    ).toBeUndefined();
  });

  it("builds an object from contextSchema fields", () => {
    expect(
      buildToolProviderContextInput({
        declared: true,
        fields: [{ name: "projectPath", kind: "string", required: true }],
        values: { projectPath: "/tmp/crate" },
        rawJson: "",
      }),
    ).toEqual({ projectPath: "/tmp/crate" });
  });

  it("parses raw JSON when there is no object schema", () => {
    expect(
      buildToolProviderContextInput({
        declared: true,
        fields: [],
        values: {},
        rawJson: '{"projectPath":"/tmp/crate"}',
      }),
    ).toEqual({ projectPath: "/tmp/crate" });
  });

  it("parses whole-context JSON when source is json", () => {
    expect(
      buildToolProviderContextInput({
        declared: true,
        fields: [
          {
            name: "allowWrite",
            kind: "json",
            required: false,
            jsonType: { type: "array", items: { type: "string" } },
          },
        ],
        values: {},
        rawJson: '{\n  "allowWrite": ["src"]\n}',
        source: "json",
      }),
    ).toEqual({ allowWrite: ["src"] });
  });

  it("omits empty raw JSON rather than inventing {}", () => {
    expect(
      buildToolProviderContextInput({
        declared: true,
        fields: [],
        values: {},
        rawJson: "  ",
      }),
    ).toBeUndefined();
  });
});

describe("seedToolProviderContextForm", () => {
  it("prefers a seed over the schema sample for object fields", () => {
    expect(
      seedToolProviderContextForm({
        fields: [{ name: "projectPath", kind: "string", required: true }],
        sample: { projectPath: "/from-sample" },
        seed: { projectPath: "/from-seed" },
      }),
    ).toEqual({ values: { projectPath: "/from-seed" }, rawJson: "" });
  });

  it("stringifies a seed for providers without an object schema", () => {
    expect(
      seedToolProviderContextForm({
        fields: [],
        seed: { projectPath: "/tmp/crate" },
      }),
    ).toEqual({
      values: {},
      rawJson: '{\n  "projectPath": "/tmp/crate"\n}',
    });
  });
});
