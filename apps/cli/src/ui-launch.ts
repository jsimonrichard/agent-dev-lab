import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";

import { AdlError } from "@agent-dev-lab/core";

import { webPackageRoot } from "./paths.js";

/** How the packaged inspection UI is started. */
export type UiLaunchMode = "framework-dev" | "project-dev" | "serve";

export function hasViteDevTree(webRoot: string): boolean {
  return (
    existsSync(path.join(webRoot, "src/routes")) && existsSync(path.join(webRoot, "vite.config.ts"))
  );
}

export function resolveUiLaunchMode(options: {
  /** Force Nitro `.output` even when the web package still has a Vite tree. */
  prebuilt: boolean;
  frameworkDev: boolean;
  webRoot?: string;
}): UiLaunchMode {
  if (options.frameworkDev) {
    return "framework-dev";
  }
  if (options.prebuilt) {
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

/** `--serve` is the public opt-out; packed Nitro without that flag still watches. */
export function adlProjectWatchEnvValue(options: { serve: boolean }): "0" | "1" {
  return options.serve ? "0" : "1";
}

/**
 * Vite args after `bun run dev --`. `--strictPort` is required: dashboard
 * already chose `--port` (hopping first if needed). Vite's default hop would
 * hide a collision from the CLI, and packed Nitro cannot hop at all.
 */
export function inspectionUiViteDevArgs(port: number): string[] {
  return ["run", "dev", "--", "--host", "127.0.0.1", "--port", String(port), "--strictPort"];
}

const LOOPBACK_LISTEN_HOSTS = ["127.0.0.1", "::1"] as const;

function tryListen(port: number, host: string): Promise<"free" | "busy"> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE") {
        resolve("busy");
        return;
      }
      if (error.code === "EADDRNOTAVAIL" || error.code === "EAFNOSUPPORT") {
        resolve("free");
        return;
      }
      reject(error);
    });
    server.listen({ port, host, exclusive: true }, () => {
      server.close((closeError) => {
        if (closeError) {
          reject(closeError);
          return;
        }
        resolve("free");
      });
    });
  });
}

async function isInspectionPortFree(port: number): Promise<boolean> {
  for (const host of LOOPBACK_LISTEN_HOSTS) {
    const result = await tryListen(port, host);
    if (result === "busy") {
      return false;
    }
  }
  return true;
}

/**
 * Packed Nitro/srvx swallows listen errors (`serve().catch(() => {})`), so a
 * second dashboard on the same port never prints `Listening on` and never
 * exits. Pick a free port before spawn (preferred, then increment unless
 * `strictPort`). Checks both loopback families because Vite binds
 * `127.0.0.1` and Nitro often binds IPv6-any.
 */
export async function resolveInspectionPort(
  preferred: number,
  options: { strictPort: boolean },
): Promise<number> {
  if (await isInspectionPortFree(preferred)) {
    return preferred;
  }
  if (options.strictPort) {
    throw new AdlError(
      "INVALID_INPUT",
      `Port ${preferred} is already in use. Stop the other inspection UI, or pass --port <free>.`,
    );
  }
  for (let port = preferred + 1; port <= 65535; port++) {
    if (await isInspectionPortFree(port)) {
      return port;
    }
  }
  throw new AdlError(
    "INVALID_INPUT",
    `No free port found at or above ${preferred}. Stop the other inspection UI, or pass --port <free>.`,
  );
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
      return spawn("bun", inspectionUiViteDevArgs(options.port), {
        cwd: webRoot,
        env,
        stdio: "inherit",
      });
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
