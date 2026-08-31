import { createServer } from "node:net";
import { openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { buildContext } from "../context";
import { cliPackageRoot } from "../paths";
import init from "../commands/init/impl";

const CLI_BIN = path.join(cliPackageRoot(), "src/bin/cli.ts");

/** Strings that mean the inspection UI failed to load the generated project. */
export const UI_FAILURE_MARKERS = [
  "Failed to load url",
  "Does the file exist?",
  "does not provide an export named",
  "The requested module",
] as const;

export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function waitUntil(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs: number,
  message: () => string,
): Promise<void> {
  const started = Date.now();
  let lastError: unknown;
  while (Date.now() - started < timeoutMs) {
    try {
      if (await predicate()) {
        return;
      }
    } catch (error) {
      lastError = error;
    }
    await wait(40);
  }
  const suffix = lastError instanceof Error ? `\n${lastError.message}` : "";
  throw new Error(`${message()}${suffix}`);
}

export function allocatePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("failed to allocate a TCP port"));
        return;
      }
      const port = address.port;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });
}

export async function runCommand(
  argv: string[],
  options: { cwd: string; timeoutMs?: number },
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const child = spawn(argv[0]!, argv.slice(1), {
    cwd: options.cwd,
    env: { ...process.env, NO_COLOR: "1", BROWSER: "none" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];
  child.stdout?.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
  child.stderr?.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

  const timeoutMs = options.timeoutMs ?? 60_000;
  const exitCode = await Promise.race([
    new Promise<number>((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) => {
        if (signal) {
          reject(new Error(`${argv.join(" ")} exited from signal ${signal}`));
          return;
        }
        resolve(code ?? 1);
      });
    }),
    wait(timeoutMs).then(() => {
      child.kill("SIGKILL");
      throw new Error(`${argv.join(" ")} timed out after ${timeoutMs}ms`);
    }),
  ]);

  return {
    stdout: Buffer.concat(stdoutChunks).toString("utf8"),
    stderr: Buffer.concat(stderrChunks).toString("utf8"),
    exitCode,
  };
}

export async function runAdl(
  args: string[],
  options: { cwd: string; timeoutMs?: number },
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return runCommand([process.execPath, "--bun", CLI_BIN, ...args], options);
}

export type ScaffoldDashboard = {
  root: string;
  name: string;
  port: number;
  baseUrl: string;
  logs: () => string;
  fetchJson: <T>(pathname: string, init?: RequestInit) => Promise<{ status: number; body: T }>;
  fetchText: (pathname: string) => Promise<{ status: number; body: string }>;
  dispose: () => Promise<void>;
};

async function bunInstall(root: string): Promise<void> {
  const result = await runCommand(["bun", "install"], { cwd: root, timeoutMs: 120_000 });
  if (result.exitCode !== 0) {
    throw new Error(`bun install failed (${result.exitCode}):\n${result.stdout}\n${result.stderr}`);
  }
}

function stopProcessTree(child: ChildProcess, signal: NodeJS.Signals = "SIGTERM"): void {
  if (child.pid && child.exitCode === null && child.signalCode === null) {
    try {
      process.kill(-child.pid, signal);
    } catch {
      child.kill(signal);
    }
  }
}

/**
 * Start `adl dashboard` (dev or `--serve`) with logs on disk and process-group
 * teardown so a SIGTERM-ignoring parent cannot leave the test hanging.
 */
export async function launchDashboardProcess(options: {
  cwd: string;
  argv: string[];
  port: number;
  env?: NodeJS.ProcessEnv;
  readyTimeoutMs?: number;
}): Promise<{
  port: number;
  baseUrl: string;
  logs: () => string;
  dispose: () => Promise<void>;
}> {
  const logPath = path.join(options.cwd, "dashboard.log");
  const logFd = openSync(logPath, "w");
  const child = spawn(options.argv[0]!, options.argv.slice(1), {
    cwd: options.cwd,
    env: {
      ...process.env,
      PORT: String(options.port),
      BROWSER: "none",
      NO_COLOR: "1",
      ADL_FRAMEWORK_DEV: "0",
      ...options.env,
    },
    stdio: ["ignore", logFd, logFd],
    detached: true,
  });

  const baseUrl = `http://127.0.0.1:${options.port}`;
  let disposed = false;

  const dispose = async (): Promise<void> => {
    if (disposed) {
      return;
    }
    disposed = true;
    stopProcessTree(child, "SIGTERM");
    await wait(500);
    if (child.exitCode === null && child.signalCode === null) {
      stopProcessTree(child, "SIGKILL");
    }
    await Promise.race([
      new Promise<void>((resolve) => {
        if (child.exitCode !== null || child.signalCode !== null) {
          resolve();
          return;
        }
        child.once("exit", () => resolve());
      }),
      wait(2_000),
    ]);
  };

  try {
    await waitUntil(
      async () => {
        try {
          const response = await fetch(`${baseUrl}/api/project`, {
            signal: AbortSignal.timeout(2_000),
          });
          return response.ok;
        } catch {
          return false;
        }
      },
      options.readyTimeoutMs ?? 60_000,
      () => `dashboard never became ready on port ${options.port}\n${readLog(logPath)}`,
    );
  } catch (error) {
    await dispose();
    throw error;
  }

  return {
    port: options.port,
    baseUrl,
    logs: () => readLog(logPath),
    dispose,
  };
}

function readLog(logPath: string): string {
  try {
    return readFileSync(logPath, "utf8");
  } catch {
    return "";
  }
}

/**
 * `adl init --local`, install deps, and start `adl dashboard` the way a generated
 * project would (`bun --bun adl dashboard`).
 */
export async function launchScaffoldDashboard(): Promise<ScaffoldDashboard> {
  const root = await mkdtemp(path.join(tmpdir(), "adl-init-e2e-"));
  const name = path.basename(root);
  await init.call(buildContext(process), { local: true }, root);
  writeFileSync(path.join(root, ".env"), "OPENAI_API_KEY=sk-e2e-placeholder\n", "utf8");
  await bunInstall(root);

  const port = await allocatePort();
  const logPath = path.join(root, "dashboard.log");
  const logFd = openSync(logPath, "w");
  const child = spawn(process.execPath, ["--bun", CLI_BIN, "dashboard", "--port", String(port)], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      BROWSER: "none",
      NO_COLOR: "1",
      ADL_FRAMEWORK_DEV: "0",
    },
    stdio: ["ignore", logFd, logFd],
    detached: true,
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  let disposed = false;

  const dispose = async (): Promise<void> => {
    if (disposed) {
      return;
    }
    disposed = true;
    stopProcessTree(child);
    await wait(300);
    if (child.exitCode === null && child.signalCode === null) {
      try {
        if (child.pid) {
          process.kill(-child.pid, "SIGKILL");
        }
      } catch {
        child.kill("SIGKILL");
      }
    }
    rmSync(root, { recursive: true, force: true });
  };

  try {
    await waitUntil(
      () => readLog(logPath).includes("Local:"),
      45_000,
      () => `dashboard never became ready on port ${port}\n${readLog(logPath)}`,
    );
  } catch (error) {
    await dispose();
    throw error;
  }

  const fetchText = async (pathname: string): Promise<{ status: number; body: string }> => {
    const response = await fetch(`${baseUrl}${pathname}`, { signal: AbortSignal.timeout(10_000) });
    return { status: response.status, body: await response.text() };
  };

  const fetchJson = async <T>(
    pathname: string,
    init?: RequestInit,
  ): Promise<{ status: number; body: T }> => {
    const response = await fetch(`${baseUrl}${pathname}`, {
      ...init,
      signal: init?.signal ?? AbortSignal.timeout(10_000),
      headers: {
        "content-type": "application/json",
        ...init?.headers,
      },
    });
    return { status: response.status, body: (await response.json()) as T };
  };

  return {
    root,
    name,
    port,
    baseUrl,
    logs: () => readLog(logPath),
    fetchJson,
    fetchText,
    dispose,
  };
}
