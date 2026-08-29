import { buildCommand } from "@stricli/core";

export const workflowsListCommand = buildCommand({
  loader: async () => import("./impl"),
  parameters: {
    flags: {
      project: {
        kind: "parsed",
        brief: "Path to the ADL project root",
        optional: true,
        parse: String,
      },
    },
  },
  docs: {
    brief: "List workflow ids in the current project",
  },
});
