import "./env";

import { createAdlRuntime } from "@agent-dev-lab/core";

/**
 * Project runtime (`src/adl.ts`) — stores and observers.
 * Referenced from `adl.config.ts` as `config.adl`; registry code imports via `#adl`.
 * @see apps/docs — guides/project-setup
 */
export const adl = createAdlRuntime();
