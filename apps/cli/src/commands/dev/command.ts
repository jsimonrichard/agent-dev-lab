import { buildCommand } from "@stricli/core";

export const devCommand = buildCommand({
  loader: async () => import("./impl.js"),
  parameters: {
    flags: {
      project: {
        kind: "parsed",
        brief: "Path to the ADL project root (directory containing adl.config.*)",
        optional: true,
        parse: String,
      },
      port: {
        kind: "parsed",
        brief: "Port for the inspection UI dev server",
        parse: Number,
        default: "3000",
      },
    },
  },
  docs: {
    brief: "Start the inspection UI dev server for an ADL project",
  },
});
