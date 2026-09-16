import type { AdlProjectConfig, AnyAgent } from "@agent-dev-lab/core";

import { adl } from "./src/adl";
import { echoAgent } from "./src/agents/echo-agent";
import { failAgent } from "./src/agents/fail-agent";
import { toolLoopAgent } from "./src/agents/tool-loop-agent";

const agents: AnyAgent[] = [echoAgent, toolLoopAgent, failAgent];

/**
 * Mock-LLM fixture for inspection UI Playwright tests. Not a live playground.
 */
export { adl };

export default {
  name: "web-e2e-fixture",
  adl,
  agents,
} satisfies AdlProjectConfig;
