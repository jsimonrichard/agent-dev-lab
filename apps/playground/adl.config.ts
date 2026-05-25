import type { AdlProjectConfig } from "@agent-dev-lab/core";

import { adl } from "./src/adl";

/**
 * Monorepo dev target for the inspection UI and CLI.
 * Registry arrays hold full agent/workflow/template objects; runtime is `src/adl.ts`.
 */
export default {
  name: "playground",
  adl,
} satisfies AdlProjectConfig;
