import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildApplication, buildRouteMap } from "@stricli/core";

import { agentsListCommand } from "./commands/agents/list/command";
import { dashboardCommand } from "./commands/dashboard/command";
import { initCommand } from "./commands/init/command";
import { runCommand } from "./commands/run/command";
import { workflowsListCommand } from "./commands/workflows/list/command";

const cliPackage = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../package.json"), "utf8"),
) as { version: string };

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
    dashboard: dashboardCommand,
    run: runCommand,
    init: initCommand,
    workflows,
    agents,
  },
  aliases: {
    d: "dashboard",
    dash: "dashboard",
  },
  docs: {
    brief: "Agent Development Lab — author, run, and inspect agent workflows",
  },
});

export const app = buildApplication(routes, {
  name: "adl",
  versionInfo: {
    currentVersion: cliPackage.version,
  },
});
