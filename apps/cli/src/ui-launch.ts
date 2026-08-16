import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

import { webPackageRoot } from "./paths.js";

/** How the packaged inspection UI is started. */
export type UiLaunchMode = "framework-dev" | "project-dev" | "serve";

export function hasViteDevTree(webRoot: string): boolean {
  return (
    existsSync(path.join(webRoot, "src/routes")) && existsSync(path.join(webRoot, "vite.config.ts"))
  );
}

export function resolveUiLaunchMode(options: {
  serve: boolean;
  frameworkDev: boolean;
  webRoot?: string;
}): UiLaunchMode {
  if (options.frameworkDev) {
    return "framework-dev";
  }
  if (options.serve) {
    return "serve";
  }
  if (hasViteDevTree(options.webRoot ?? webPackageRoot())) {
    return "project-dev";
  }
  return "serve";
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
      return spawn("bun", ["run", "dev", "--", "--port", String(options.port)], {
        cwd: webRoot,
        env,
        stdio: "inherit",
      });
    case "serve":
      return spawn("bun", ["run", "start"], {
        cwd: webRoot,
        env: { ...env, ADL_INSPECTOR_SERVE: "1" },
        stdio: "inherit",
      });
  }
}
