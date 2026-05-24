import type { AdlProjectConfig } from "@agent-dev-lab/runtime";

/**
 * Monorepo dev target for the inspection UI and CLI.
 * End-user projects use the same `adl.config.*` shape at their project root.
 */
export default {
  name: "playground",
} satisfies AdlProjectConfig;
