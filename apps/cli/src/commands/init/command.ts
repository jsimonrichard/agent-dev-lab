import { buildCommand } from "@stricli/core";

import { isAdlCliSourceCheckout } from "../../paths";

export interface InitFlags {
  local: boolean;
  /** When true, run `git init` in the new project. Default is no VCS. */
  git: boolean;
}

export function initCommandFlags(showLocal: boolean) {
  return {
    local: {
      kind: "boolean" as const,
      brief: "Pin @agent-dev-lab packages to this checkout with file: (framework development)",
      default: false,
      hidden: !showLocal,
    },
    git: {
      kind: "boolean" as const,
      brief: "Run git init in the new project (default: no repository)",
      default: false,
    },
  };
}

export const initCommand = buildCommand({
  loader: async () => import("./impl"),
  parameters: {
    flags: initCommandFlags(isAdlCliSourceCheckout()),
    aliases: {
      l: "local",
      g: "git",
    },
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
