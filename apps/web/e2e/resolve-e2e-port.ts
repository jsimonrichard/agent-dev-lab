import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

/** Default Vite port for `apps/web` Playwright when `ADL_E2E_PORT` is unset. */
export const DEFAULT_WEB_E2E_PORT = 3100;

/** Env set after the first ephemeral allocation so worker processes reuse it. */
export const ADL_E2E_RESOLVED_PORT_ENV = "ADL_E2E_RESOLVED_PORT";

export type ResolvedE2ePort = {
  port: number;
  /**
   * True when the port was allocated (`ADL_E2E_PORT=0`). Playwright must not
   * `reuseExistingServer` in that case — another process on a different port
   * is not our dashboard.
   */
  ephemeral: boolean;
};

/**
 * Resolves the Playwright dashboard port from `ADL_E2E_PORT`.
 *
 * Sync so `playwright.config.ts` can export a plain object (Playwright 1.63 does
 * not await async config modules). Config is loaded once in the runner and again
 * in each worker, so ephemeral ports are pinned via
 * {@link ADL_E2E_RESOLVED_PORT_ENV} and a cwd-keyed temp file.
 *
 * - unset / empty → {@link DEFAULT_WEB_E2E_PORT} (3100)
 * - positive integer → that fixed port
 * - `0` → ephemeral loopback port (parallel lanes / gate)
 *
 * Throws on non-integer or out-of-range values (fail closed).
 */
export function resolveE2ePort(
  raw: string | undefined = process.env.ADL_E2E_PORT,
): ResolvedE2ePort {
  const trimmed = raw?.trim();
  if (trimmed === undefined || trimmed === "") {
    return { port: DEFAULT_WEB_E2E_PORT, ephemeral: false };
  }
  if (!/^\d+$/.test(trimmed)) {
    throw new Error(`ADL_E2E_PORT must be a non-negative integer, got ${JSON.stringify(raw)}`);
  }
  const n = Number(trimmed);
  if (n > 65535) {
    throw new Error(`ADL_E2E_PORT out of range (0–65535): ${n}`);
  }
  if (n === 0) {
    return resolveEphemeralPort();
  }
  return { port: n, ephemeral: false };
}

function resolveEphemeralPort(): ResolvedE2ePort {
  const pinned = readPinnedPort();
  if (pinned !== null) {
    process.env[ADL_E2E_RESOLVED_PORT_ENV] = String(pinned);
    return { port: pinned, ephemeral: true };
  }

  const port = allocateEphemeralPortSync();
  process.env[ADL_E2E_RESOLVED_PORT_ENV] = String(port);
  try {
    writeFileSync(ephemeralStatePath(), `${port}\n`, { flag: "wx" });
  } catch {
    const winner = readPinnedPort();
    if (winner === null) {
      throw new Error("failed to pin ephemeral e2e port for Playwright workers");
    }
    process.env[ADL_E2E_RESOLVED_PORT_ENV] = String(winner);
    return { port: winner, ephemeral: true };
  }
  return { port, ephemeral: true };
}

function readPinnedPort(): number | null {
  const fromEnv = process.env[ADL_E2E_RESOLVED_PORT_ENV]?.trim();
  if (fromEnv && /^\d+$/.test(fromEnv)) {
    const port = Number(fromEnv);
    if (port > 0 && port <= 65535) {
      return port;
    }
  }
  try {
    const fromFile = readFileSync(ephemeralStatePath(), "utf8").trim();
    if (/^\d+$/.test(fromFile)) {
      const port = Number(fromFile);
      if (port > 0 && port <= 65535) {
        return port;
      }
    }
  } catch {
    // no pin yet
  }
  return null;
}

/** Cwd-keyed path so runner + workers in one Playwright run share a pin. */
export function ephemeralStatePath(cwd: string = process.cwd()): string {
  const digest = createHash("sha256").update(cwd).digest("hex").slice(0, 12);
  return path.join(tmpdir(), `adl-web-e2e-port-${digest}`);
}

/**
 * Ask a short-lived child to bind `listen(0)` and print the port. Config load
 * is synchronous, so we cannot use async `net.Server` here.
 */
function allocateEphemeralPortSync(): number {
  const script = `
const { createServer } = require("node:net");
const server = createServer();
server.once("error", (error) => {
  console.error(error);
  process.exit(1);
});
server.listen(0, "127.0.0.1", () => {
  const address = server.address();
  if (!address || typeof address === "string") {
    console.error("failed to allocate an ephemeral e2e port");
    process.exit(1);
  }
  process.stdout.write(String(address.port));
  server.close(() => process.exit(0));
});
`;
  const result = spawnSync(process.execPath, ["-e", script], {
    encoding: "utf8",
    timeout: 5_000,
  });
  if (result.status !== 0) {
    throw new Error(
      `failed to allocate an ephemeral e2e port: ${result.stderr || result.error?.message || "unknown error"}`,
    );
  }
  const port = Number(result.stdout.trim());
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(
      `failed to allocate an ephemeral e2e port: got ${JSON.stringify(result.stdout)}`,
    );
  }
  return port;
}
