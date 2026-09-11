import { createAdlRuntime } from "./create";
import type { AdlRuntime, AdlRuntimeConfig } from "./types";

/**
 * Runtime with in-memory stores for unit tests. Pass `defaults.model` (or a
 * mock {@link LanguageModel}) when the test creates agents.
 *
 * Run version tagging is off unless the caller asks for it: resolving it
 * shells out to jj or git, so leaving it on would make a unit test's recorded
 * tags depend on the ambient state of whatever repository it happens to run
 * inside. Pass `version` explicitly to exercise tagging.
 */
export function createTestRuntime(config: AdlRuntimeConfig = {}): AdlRuntime {
  return createAdlRuntime({ version: false, ...config });
}
