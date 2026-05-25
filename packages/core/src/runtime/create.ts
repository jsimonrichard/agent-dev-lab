import { AdlRuntimeImpl } from "./adl-runtime";
import type { AdlRuntime, AdlRuntimeConfig } from "./types";

export type { AdlRuntime } from "./types";

/** Creates the process-level ADL runtime (wrapper over {@link AdlRuntimeImpl}). */
export function createAdlRuntime(config: AdlRuntimeConfig = {}): AdlRuntime {
  return new AdlRuntimeImpl(config);
}
