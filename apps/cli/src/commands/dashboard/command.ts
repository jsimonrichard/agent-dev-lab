import { buildCommand } from "@stricli/core";

export const dashboardCommand = buildCommand({
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
        brief: "Do not reload agents, workflows, or templates when their files change",
        default: false,
      },
      prebuilt: {
        kind: "boolean",
        brief: "Use the shipped UI build instead of the live UI source",
        default: false,
      },
      strictPort: {
        kind: "boolean",
        brief: "Fail if --port is already bound instead of using the next free port",
        default: false,
      },
    },
    aliases: {
      p: "project",
      P: "port",
      s: "serve",
      b: "prebuilt",
    },
  },
  docs: {
    brief: "Start the inspection UI for an ADL project",
  },
});
