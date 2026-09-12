/**
 * Child process that owns one `SandboxManager`. Spawned by `createAsrtBashExecutor`.
 * Exits when stdin closes (host gone / `dispose`) after `SandboxManager.reset()`.
 */
import { randomUUID } from "node:crypto";

import { AdlError, createAsyncChannel, isAdlError } from "@agent-dev-lab/core";
import { SandboxManager, type SandboxDependencyCheck } from "@anthropic-ai/sandbox-runtime";

import type { BashExecutorUpdate } from "./executor.ts";
import { runArgvIntoChannel } from "./process-channel.ts";
import {
  attachNdjsonReader,
  writeNdjson,
  type AsrtSupervisorEvent,
  type AsrtSupervisorRequest,
} from "./asrt-protocol.ts";

const LINUX_INSTALL_HINTS: Array<{ match: string; hint: string }> = [
  {
    match: "bwrap",
    hint: "bubblewrap: `apt-get install bubblewrap` / `dnf install bubblewrap` / `pacman -S bubblewrap`",
  },
  {
    match: "socat",
    hint: "socat: `apt-get install socat` / `dnf install socat` / `pacman -S socat`",
  },
  {
    match: "ripgrep",
    hint: "ripgrep: `apt-get install ripgrep` / `dnf install ripgrep` / `pacman -S ripgrep`",
  },
];

const MACOS_INSTALL_HINTS: Array<{ match: string; hint: string }> = [
  { match: "ripgrep", hint: "ripgrep: `brew install ripgrep`" },
];

function installHints(errors: string[]): string[] {
  const table = process.platform === "darwin" ? MACOS_INSTALL_HINTS : LINUX_INSTALL_HINTS;
  const hints = new Set<string>();
  for (const error of errors) {
    for (const { match, hint } of table) {
      if (error.toLowerCase().includes(match)) {
        hints.add(hint);
      }
    }
  }
  return [...hints];
}

function dependencyError(check: SandboxDependencyCheck): AdlError {
  const hints = installHints(check.errors);
  const hintText = hints.length > 0 ? ` Install: ${hints.join("; ")}.` : "";
  return new AdlError(
    "INIT_FAILED",
    `ASRT sandbox dependencies missing: ${check.errors.join("; ")}.${hintText} ` +
      `No automatic fallback to an unsandboxed executor is used; install the missing ` +
      `dependencies or configure a different BashExecutor.`,
  );
}

function send(event: AsrtSupervisorEvent): void {
  writeNdjson(process.stdout, event);
}

function sendError(id: string, error: unknown): void {
  if (isAdlError(error)) {
    send({ id, type: "error", code: error.code, message: error.message });
    return;
  }
  send({
    id,
    type: "error",
    message: error instanceof Error ? error.message : String(error),
  });
}

function isRequest(value: unknown): value is AsrtSupervisorRequest {
  if (typeof value !== "object" || value === null || !("type" in value) || !("id" in value)) {
    return false;
  }
  const type = (value as { type: unknown }).type;
  return type === "init" || type === "run" || type === "abort" || type === "shutdown";
}

async function main(): Promise<void> {
  if (process.stdin.isTTY) {
    throw new AdlError(
      "INIT_FAILED",
      "asrt-supervisor: spawn this file as a child process (stdin must be a pipe).",
    );
  }

  let initialized = false;
  let sandboxEnv: Record<string, string> = {};
  const runs = new Map<string, AbortController>();
  let shuttingDown = false;

  const shutdown = async (): Promise<void> => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    for (const controller of runs.values()) {
      controller.abort();
    }
    await SandboxManager.reset();
    send({ id: "shutdown", type: "bye" });
    process.exit(0);
  };

  process.stdin.on("end", () => {
    void shutdown();
  });
  process.stdin.on("error", () => {
    void shutdown();
  });

  attachNdjsonReader(
    process.stdin,
    (value) => {
      if (!isRequest(value)) {
        send({
          id: "unknown",
          type: "error",
          message: "asrt-supervisor: malformed request",
        });
        return;
      }
      void handleRequest(value);
    },
    (error) => {
      sendError("unknown", error);
    },
  );

  async function handleRequest(request: AsrtSupervisorRequest): Promise<void> {
    try {
      switch (request.type) {
        case "init": {
          const check = SandboxManager.checkDependencies();
          if (check.errors.length > 0) {
            throw dependencyError(check);
          }
          await SandboxManager.initialize(request.config);
          sandboxEnv = { ...request.sandboxEnv };
          initialized = true;
          send({ id: request.id, type: "ready" });
          return;
        }
        case "run": {
          if (!initialized) {
            throw new AdlError("INIT_FAILED", "asrt-supervisor: run before init");
          }
          if (request.argv.length === 0) {
            throw new AdlError("INIT_FAILED", "Empty argv for the command to run.");
          }
          const controller = new AbortController();
          runs.set(request.id, controller);
          try {
            const commandId = randomUUID();
            // wrapWithSandboxArgv takes a command *string* (the "Argv" in the name is its
            // return shape). Putting each element in the spawn env and exec'ing the
            // `$ADL_ARGV_*` refs means the values never appear in that string — they are
            // not shell-parsed. Named because there is no upstream argv-in API.
            const extraEnv: Record<string, string> = {};
            const refs: string[] = [];
            for (const [i, arg] of request.argv.entries()) {
              const key = `ADL_ARGV_${String(i)}`;
              extraEnv[key] = arg;
              refs.push(`"$${key}"`);
            }
            const { argv: sandboxArgv, env: asrtEnv } = await SandboxManager.wrapWithSandboxArgv(
              `exec ${refs.join(" ")}`,
              undefined,
              undefined,
              controller.signal,
              request.cwd,
              { commandId },
            );
            // Start from the host allowlist (default none), then keep only ASRT-injected
            // overrides (proxy vars, etc.) — never the full host `process.env`.
            const spawnEnv: Record<string, string> = { ...sandboxEnv };
            for (const [key, value] of Object.entries(asrtEnv)) {
              if (typeof value !== "string") {
                continue;
              }
              if (process.env[key] !== value) {
                spawnEnv[key] = value;
              }
            }
            Object.assign(spawnEnv, extraEnv);
            const channel = createAsyncChannel<BashExecutorUpdate>();
            runArgvIntoChannel(
              sandboxArgv,
              spawnEnv,
              {
                cwd: request.cwd,
                timeoutMs: request.timeoutMs,
                signal: controller.signal,
              },
              request.maxOutputBytes,
              channel,
              (rawStderr) => SandboxManager.annotateStderrWithSandboxFailures(commandId, rawStderr),
            );
            for await (const update of channel) {
              send({ id: request.id, type: "update", update });
            }
          } finally {
            runs.delete(request.id);
          }
          return;
        }
        case "abort": {
          runs.get(request.id)?.abort();
          return;
        }
        case "shutdown": {
          await shutdown();
        }
      }
    } catch (error) {
      sendError(request.id, error);
    }
  }
}

void main().catch((error: unknown) => {
  sendError("main", error);
  process.exit(1);
});
