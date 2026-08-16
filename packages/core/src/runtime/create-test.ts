import { createAdlRuntime } from "./create";
import type { AdlRuntime, AdlRuntimeConfig } from "./types";

/**
 * Runtime with in-memory stores for unit tests. Pass `defaults.model` (or a
 * mock {@link LanguageModel}) when the test creates agents.
 */
export function createTestRuntime(config: AdlRuntimeConfig = {}): AdlRuntime {
  return createAdlRuntime(config);
}
