import type { AdlProjectConfig } from "@agent-dev-lab/core";

import { adl } from "#adl";

import { assistant } from "./src/agents/assistant";
import { ask } from "./src/workflows/ask";
import { demoCounter } from "./src/workflows/demo-counter";

/**
 * Starter project registry. `adl init` copies this tree; keep imports in this
 * file limited to modules that ship with the scaffold.
 */
export { adl };

export default {
  name: "adl-scaffold",
  adl,
  agents: [assistant],
  workflows: [demoCounter, ask],
} satisfies AdlProjectConfig;
