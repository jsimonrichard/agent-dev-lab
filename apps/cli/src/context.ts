import type { CommandContext } from "@stricli/core";

import { monorepoPlaygroundRoot } from "./paths";

export interface AdlCliContext extends CommandContext {
  readonly process: NodeJS.Process;
  /** Default ADL project root when developing inside this monorepo. */
  readonly defaultProjectRoot: string;
}

export function buildContext(proc: NodeJS.Process): AdlCliContext {
  return {
    process: proc,
    defaultProjectRoot: monorepoPlaygroundRoot(),
  };
}
