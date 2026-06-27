import { createAdlRuntime } from "@agent-dev-lab/core";

/**
 * Project runtime — stores and observers live here, not in `adl.config.ts`.
 * @see apps/docs — core/runtime
 */
export const adl = createAdlRuntime();
