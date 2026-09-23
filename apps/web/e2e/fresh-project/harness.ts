import { createServer } from "node:net";
import { existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdtemp, rename, writeFile } from "node:fs/promises";
import { spawn, type ChildProcess } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const monorepoRoot = path.resolve(webRoot, "../..");

/** Persisted by global setup so Playwright workers share one packed dashboard. */
export const FRESH_PROJECT_STATE_PATH = path.join(tmpdir(), "adl-fresh-project-e2e-state.json");

export type FreshProjectState = {
  /** Parent of `root` / `packOut` — removed on teardown. */
  scratch: string;
  root: string;
  packOut: string;
  baseURL: string;
  port: number;
  logPath: string;
  demoCounterPath: string;
  /** Detached process-group leader for the packed dashboard. */
  pid: number;
};

function wait(ms: number): Promise<void> {
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

export function readDashboardLogs(logPath: string): string {
  try {
    return readFileSync(logPath, "utf8");
  } catch {
    return "";
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

function killProcessGroup(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pid, signal);
  } catch {
    try {
      process.kill(pid, signal);
    } catch {
      // already exited
    }
  }
}

async function runCommand(
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

function canSkipBuild(): boolean {
  return (
    existsSync(path.join(monorepoRoot, "apps/web/.output/server/index.mjs")) &&
    existsSync(path.join(monorepoRoot, "packages/core/dist")) &&
    existsSync(path.join(monorepoRoot, "apps/cli/dist")) &&
    existsSync(path.join(monorepoRoot, "packages/tools/dist"))
  );
}

function demoCounterSource(stepsDefault: number): string {
  return `import { z } from "zod";

import { adl } from "../adl";

/** Step-only demo workflow for the inspection UI (no LLM). */
export const demoCounter = adl.createWorkflow({
  id: "demo-counter",
  inputSchema: z.object({
    steps: z.number().int().min(1).max(8).default(${stepsDefault}).describe("Accumulate steps (1–8)."),
  }),
  run: async (input, ctx) => {
    let sum = 0;
    for (let i = 0; i < input.steps; i++) {
      const value = await ctx.step("accumulate", async () => i + 1, { key: String(i) });
      sum += value;
    }
    return { sum, steps: input.steps };
  },
});
`;
}

async function atomicWrite(filePath: string, contents: string): Promise<void> {
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(tmpPath, contents, "utf8");
  await rename(tmpPath, filePath);
}

export async function writeDemoCounterStepsDefault(
  demoCounterPath: string,
  steps: number,
): Promise<void> {
  await atomicWrite(demoCounterPath, demoCounterSource(steps));
}

export async function writeBrokenDemoCounter(demoCounterPath: string): Promise<void> {
  await atomicWrite(demoCounterPath, "this is not valid typescript [[[\n");
}

/**
 * `pack:local` into an isolated `--out`, attach a tmp consumer, start the packed
 * Node dashboard with project watch enabled (no `--serve`).
 * Caller must {@link stopFreshProjectDashboard} when finished.
 */
export async function launchFreshProjectDashboard(): Promise<FreshProjectState> {
  const scratch = await mkdtemp(path.join(tmpdir(), "adl-fresh-e2e-"));
  const packOut = path.join(scratch, "pack");
  const root = path.join(scratch, "project");
  mkdirSync(root, { recursive: true });

  const packArgs = [
    "run",
    "pack:local",
    "--",
    "--out",
    packOut,
    "--project",
    root,
    ...(canSkipBuild() ? (["--skip-build"] as const) : []),
  ];
  const pack = await runCommand(["bun", ...packArgs], {
    cwd: monorepoRoot,
    timeoutMs: 600_000,
  });
  if (pack.exitCode !== 0) {
    rmSync(scratch, { recursive: true, force: true });
    throw new Error(`pack:local failed (${pack.exitCode}):\n${pack.stdout}\n${pack.stderr}`);
  }

  writeFileSync(path.join(root, ".env"), "OPENAI_API_KEY=sk-e2e-placeholder\n", "utf8");

  const packedCli = path.join(root, "node_modules/@agent-dev-lab/cli/dist/cli.js");
  if (!existsSync(packedCli)) {
    rmSync(scratch, { recursive: true, force: true });
    throw new Error(`packed CLI missing after pack:local: ${packedCli}`);
  }

  const port = await allocatePort();
  const logPath = path.join(root, "dashboard.log");
  const logFd = openSync(logPath, "w");
  // Published path: Node hosts Nitro `.output`. Omit `--serve` so watch stays on.
  const child = spawn(process.execPath, [packedCli, "dashboard", "--port", String(port)], {
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

  if (child.pid === undefined) {
    rmSync(scratch, { recursive: true, force: true });
    throw new Error("packed dashboard spawn did not yield a pid");
  }

  const baseURL = `http://127.0.0.1:${port}`;
  const logs = () => readDashboardLogs(logPath);

  const abortLaunch = async (): Promise<void> => {
    stopProcessTree(child, "SIGKILL");
    await wait(300);
    rmSync(scratch, { recursive: true, force: true });
  };

  try {
    await waitUntil(
      async () => {
        try {
          const response = await fetch(`${baseURL}/api/project`, {
            signal: AbortSignal.timeout(2_000),
          });
          return response.ok;
        } catch {
          return false;
        }
      },
      120_000,
      () => `packed dashboard never became ready on port ${port}\n${logs()}`,
    );

    await waitUntil(
      () => logs().includes("[adl] watching"),
      60_000,
      () => `packed dashboard never armed project watch\n${logs()}`,
    );
  } catch (error) {
    await abortLaunch();
    throw error;
  }

  // Detach from the child so the setup process can exit without killing it.
  child.unref();

  return {
    scratch,
    root,
    packOut,
    baseURL,
    port,
    logPath,
    demoCounterPath: path.join(root, "src/workflows/demo-counter.ts"),
    pid: child.pid,
  };
}

export async function stopFreshProjectDashboard(state: FreshProjectState): Promise<void> {
  killProcessGroup(state.pid, "SIGTERM");
  await wait(500);
  killProcessGroup(state.pid, "SIGKILL");
  await wait(200);
  rmSync(state.scratch, { recursive: true, force: true });
}

export function readFreshProjectState(): FreshProjectState {
  if (!existsSync(FRESH_PROJECT_STATE_PATH)) {
    throw new Error(
      `fresh-project e2e state missing at ${FRESH_PROJECT_STATE_PATH}; global setup did not run`,
    );
  }
  return JSON.parse(readFileSync(FRESH_PROJECT_STATE_PATH, "utf8")) as FreshProjectState;
}

export function writeFreshProjectState(state: FreshProjectState): void {
  writeFileSync(FRESH_PROJECT_STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export function clearFreshProjectState(): void {
  rmSync(FRESH_PROJECT_STATE_PATH, { force: true });
}
