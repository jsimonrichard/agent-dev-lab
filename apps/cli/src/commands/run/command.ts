import { buildCommand } from "@stricli/core";

export const runCommand = buildCommand({
  loader: async () => import("./impl"),
  parameters: {
    positional: {
      kind: "tuple",
      parameters: [
        {
          brief: "Workflow id from adl.config",
          parse: String,
          placeholder: "workflow-id",
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
        brief: "JSON input passed to workflow.run",
        parse: String,
        default: "{}",
      },
    },
  },
  docs: {
    brief: "Run a workflow from the project registry",
  },
});
