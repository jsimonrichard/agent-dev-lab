import { buildCommand } from "@stricli/core";

import { isAdlCliSourceCheckout } from "../../paths";

export interface InitFlags {
  local: boolean;
}

export function initCommandFlags(showLocal: boolean) {
  const brief = "Pin @agent-dev-lab packages to this checkout with file: (framework development)";
  if (showLocal) {
    return {
      local: {
        kind: "boolean" as const,
        brief,
        default: false,
      },
    };
  }
  return {
    local: {
      kind: "boolean" as const,
      brief,
      default: false,
      hidden: true as const,
    },
  };
}

export const initCommand = buildCommand({
  loader: async () => import("./impl"),
  parameters: {
    flags: initCommandFlags(isAdlCliSourceCheckout()),
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
