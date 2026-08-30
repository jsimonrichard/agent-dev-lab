import { buildCommand } from "@stricli/core";

export const agentsRunCommand = buildCommand({
  loader: async () => import("./impl"),
  parameters: {
    positional: {
      kind: "tuple",
      parameters: [
        {
          brief: "Agent id from adl.config",
          parse: String,
          placeholder: "agent-id",
        },
      ],
    },
    flags: {
      project: {
        kind: "parsed",
        brief: "Path to the ADL project root",
        optional: true,
        parse: String,
      },
      input: {
        kind: "parsed",
        brief: "User message passed to agent.run (plain string, not JSON)",
        parse: String,
        default: "",
      },
      scope: {
        kind: "parsed",
        brief: "memoryScope for this episode (omit to allocate a new conversation)",
        optional: true,
        parse: String,
      },
    },
  },
  docs: {
    brief: "Run an agent from the project registry with a string user message",
  },
});
