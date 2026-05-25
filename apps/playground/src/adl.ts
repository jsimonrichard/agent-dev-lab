import { createAdlRuntime } from "@agent-dev-lab/core";

/**
 * Project runtime — stores and observers live here, not in `adl.config.ts`.
 * @see notes/runtime-api.md
 */
export const adl = createAdlRuntime();
