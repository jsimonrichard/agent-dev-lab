import { buildCommand } from "@stricli/core";

export const devCommand = buildCommand({
  loader: async () => import("./impl"),
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
        brief: "Port for the inspection UI",
        parse: Number,
        default: "3000",
      },
      serve: {
        kind: "boolean",
        brief: "Run the prebuilt inspection UI (Nitro) instead of Vite dev",
        default: false,
      },
    },
  },
  docs: {
    brief: "Start the inspection UI for an ADL project",
  },
});
