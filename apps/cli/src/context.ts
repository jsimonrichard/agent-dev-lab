import type { CommandContext } from "@stricli/core";

import { resolveDefaultProjectRoot } from "./resolve-packages";

export interface AdlCliContext extends CommandContext {
  readonly process: NodeJS.Process;
  /** Default ADL project root (playground in monorepo dev, otherwise cwd). */
  readonly defaultProjectRoot: string;
}

export function buildContext(proc: NodeJS.Process): AdlCliContext {
  return {
    process: proc,
    defaultProjectRoot: resolveDefaultProjectRoot(),
  };
}
