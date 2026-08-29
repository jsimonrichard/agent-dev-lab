import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildApplication, buildRouteMap } from "@stricli/core";

import { agentsListCommand } from "./commands/agent/list/command";
import { dashboardCommand } from "./commands/dashboard/command";
import { initCommand } from "./commands/init/command";
import { workflowsListCommand } from "./commands/workflow/list/command";
import { runCommand } from "./commands/workflow/run/command";

const cliPackage = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../package.json"), "utf8"),
) as { version: string };

const workflow = buildRouteMap({
  routes: {
    list: workflowsListCommand,
    run: runCommand,
  },
  docs: {
    brief: "Inspect and run registered workflows",
  },
});

const agent = buildRouteMap({
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
    init: initCommand,
    workflow,
    agent,
  },
  aliases: {
    d: "dashboard",
    dash: "dashboard",
    a: "agent",
    w: "workflow",
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
