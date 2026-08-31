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

/**
 * A TTY Ctrl+C already reaches the UI child via the process group. When the
 * CLI is spawned without a TTY (tests, scripts, `kill <pid>`), only the CLI
 * gets the signal — forward it so `--serve` can shut down.
 */
export function shouldForwardUiChildSignals(
  stdin: { isTTY?: boolean } | null | undefined,
): boolean {
  return stdin?.isTTY !== true;
}

export function spawnInspectionUi(options: {
  mode: UiLaunchMode;
  port: number;
  env: NodeJS.ProcessEnv;
}): ChildProcess {
  const webRoot = webPackageRoot();
  const env: NodeJS.ProcessEnv = { ...options.env, PORT: String(options.port) };

  switch (options.mode) {
    case "framework-dev":
    case "project-dev":
      return spawn(
        "bun",
        ["run", "dev", "--", "--host", "127.0.0.1", "--port", String(options.port)],
        {
          cwd: webRoot,
          env,
          stdio: "inherit",
        },
      );
    case "serve":
      // Published path: run Nitro `.output` under Node (better-sqlite3). Call the
      // server entry directly — do not go through `bun run start` (Bun / bun:sqlite).
      return spawn("node", [path.join(webRoot, ".output/server/index.mjs")], {
        cwd: webRoot,
        env: {
          ...env,
          ADL_INSPECTOR_SERVE: "1",
        },
        stdio: "inherit",
      });
  }
}
