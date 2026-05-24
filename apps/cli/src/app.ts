import { buildApplication, buildRouteMap } from "@stricli/core";

import { devCommand } from "./commands/dev/command";

const routes = buildRouteMap({
  routes: {
    dev: devCommand,
  },
  docs: {
    brief: "Agent Development Lab — author, run, and inspect agent workflows",
  },
});

export const app = buildApplication(routes, {
  name: "adl",
  versionInfo: {
    currentVersion: "0.0.1",
  },
});
