import { buildCommand } from "@stricli/core";

export const initCommand = buildCommand({
  loader: async () => import("./impl"),
  parameters: {
    flags: {},
    positional: {
      kind: "tuple",
      parameters: [
        {
          brief: "Directory to create (use . for the current directory)",
          parse: String,
          placeholder: "dir",
        },
      ],
    },
  },
  docs: {
    brief: "Scaffold a new ADL project",
  },
});
