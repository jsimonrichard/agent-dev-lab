import type { AdlProjectConfig, AnyAgent } from "@agent-dev-lab/core";

import { adl } from "./src/adl";
import { echoAgent } from "./src/agents/echo-agent";
import { failAgent } from "./src/agents/fail-agent";
import { toolLoopAgent } from "./src/agents/tool-loop-agent";
import { hangForRetry } from "./src/workflows/hang-for-retry";
import { retryLineage } from "./src/workflows/retry-lineage";
import { retryNestLeaf, retryNestedLineage } from "./src/workflows/retry-nested-lineage";

const agents: AnyAgent[] = [echoAgent, toolLoopAgent, failAgent];

/**
 * Mock-LLM fixture for inspection UI Playwright tests. Not a live playground.
 */
export { adl };

export default {
  name: "web-e2e-fixture",
  adl,
  agents,
  workflows: [retryLineage, hangForRetry, retryNestedLineage, retryNestLeaf],
} satisfies AdlProjectConfig;
