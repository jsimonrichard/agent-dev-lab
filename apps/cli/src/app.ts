import { buildApplication, buildRouteMap } from "@stricli/core";

import { agentsListCommand } from "./commands/agents/list/command";
import { devCommand } from "./commands/dev/command";
import { initCommand } from "./commands/init/command";
import { runCommand } from "./commands/run/command";
import { workflowsListCommand } from "./commands/workflows/list/command";

const workflows = buildRouteMap({
  routes: {
    list: workflowsListCommand,
  },
  docs: {
    brief: "Inspect registered workflows",
  },
});

const agents = buildRouteMap({
  routes: {
    list: agentsListCommand,
  },
  docs: {
    brief: "Inspect registered agents",
  },
});

const routes = buildRouteMap({
  routes: {
    dev: devCommand,
    run: runCommand,
    init: initCommand,
    workflows,
    agents,
  },
  docs: {
    brief: "Agent Development Lab — author, run, and inspect agent workflows",
  },
});

export const app = buildApplication(routes, {
  name: "adl",
  versionInfo: {
    currentVersion: "0.1.0",
  },
});
