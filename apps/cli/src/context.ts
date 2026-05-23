import type { CommandContext } from "@stricli/core";

export type AdlCliContext = CommandContext & {
  readonly process: NodeJS.Process;
};

export function buildContext(proc: NodeJS.Process): AdlCliContext {
  return { process: proc };
}
