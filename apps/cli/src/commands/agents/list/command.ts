import { buildCommand } from "@stricli/core";

export const agentsListCommand = buildCommand({
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
    brief: "List agent ids in the current project",
  },
});
