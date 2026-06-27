import { AdlRuntimeImpl } from "./adl-runtime.js";
import type { AdlRuntime, AdlRuntimeConfig } from "./types.js";

export type { AdlRuntime } from "./types.js";

/** Creates the process-level ADL runtime (wrapper over {@link AdlRuntimeImpl}). */
export function createAdlRuntime(config: AdlRuntimeConfig = {}): AdlRuntime {
  return new AdlRuntimeImpl(config);
}
