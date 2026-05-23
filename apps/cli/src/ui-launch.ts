import { spawn, type ChildProcess } from "node:child_process";

import { webPackageRoot } from "./paths.js";

/** How the packaged inspection UI is started. */
export type UiLaunchMode = "framework-dev" | "project-dev" | "serve";

export function resolveUiLaunchMode(options: {
  serve: boolean;
  frameworkDev: boolean;
}): UiLaunchMode {
  if (options.frameworkDev) {
    return "framework-dev";
  }
  if (options.serve) {
    return "serve";
  }
  return "project-dev";
}

export function spawnInspectionUi(options: {
  mode: UiLaunchMode;
  port: number;
  env: NodeJS.ProcessEnv;
}): ChildProcess {
  const webRoot = webPackageRoot();
  const env = { ...options.env, PORT: String(options.port) };

  switch (options.mode) {
    case "framework-dev":
      return spawn("bun", ["run", "dev", "--", "--port", String(options.port)], {
        cwd: webRoot,
        env,
        stdio: "inherit",
      });
    case "project-dev":
      return spawn("bun", ["run", "dev:project", "--", "--port", String(options.port)], {
        cwd: webRoot,
        env,
        stdio: "inherit",
      });
    case "serve":
      return spawn("bun", ["run", "start"], {
        cwd: webRoot,
        env,
        stdio: "inherit",
      });
  }
}
