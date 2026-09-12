import { spawn, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { AdlError, createAsyncChannel } from "@agent-dev-lab/core";
import type { SandboxRuntimeConfig } from "@anthropic-ai/sandbox-runtime";

import { resolveAllowEnv, type AllowEnv } from "../allow-env.ts";
import type { BashExecutor, BashExecutorUpdate } from "../executor.ts";
import { DEFAULT_MAX_OUTPUT_BYTES } from "../process-channel.ts";
import { existingSystemReadPaths } from "../read-bounds.ts";
import { resolveCommandOnPath } from "../resolve-command.ts";
import {
  attachNdjsonReader,
  writeNdjson,
  type AsrtSupervisorEvent,
  type AsrtSupervisorRequest,
} from "./protocol.ts";

export interface AsrtBashExecutorOptions {
  /**
   * Paths writable inside the sandbox — e.g. the tool's configured project root. Required,
   * matching the no-unsandboxed-default rule: pass `[]` for a
   * sandbox that can run commands but write nowhere, not an implicit "everything."
   */
  allowWrite: string[];
  /** Paths to deny read, on top of whatever ASRT denies by default (e.g. `~/.ssh`). */
  denyRead?: string[];
  /**
   * Confine **reads** to these paths. Omitted — the default — confines reads to
   * `allowWrite`. Pass `null` for host-wide reads (ASRT's read-everywhere posture).
   * A list is exactly those roots (plus system/vendor paths required to execute).
   *
   * ASRT expresses a bound list as deny-then-allow, where `allowRead` re-allows within a
   * denied region and takes precedence over `denyRead` (the opposite of write). This
   * executor supplies the broad denial for you — `denyRead: ["/"]` — when a list is set.
   * Any `denyRead` you pass is still applied on top.
   *
   * `existingSystemReadPaths()` and ASRT's own package directory are re-allowed
   * automatically when reads are bounded: without the former nothing can execute, and
   * without the latter ASRT's vendored `apply-seccomp` helper is hidden from the sandbox
   * it is setting up (verified — the command dies with exit 127 before it starts).
   */
  allowRead?: string[] | null;
  denyWrite?: string[];
  /** Domains allowed for network access. Omit/empty (the default) means no network access. */
  allowedDomains?: string[];
  deniedDomains?: string[];
  /** Bytes to keep from `stdout`/`stderr` each before truncating. Default 1,000,000 (1 MB). */
  maxOutputBytes?: number;
  /**
   * Host environment variables to expose inside the sandbox. Omitted / `[]` → none.
   * `true` → every string-valued host var. A list matches names (literal, glob, or `RegExp`).
   * The supervisor process itself may still inherit the host env (it is trusted); only the
   * sandboxed command's env is filtered.
   */
  allowEnv?: AllowEnv;
}

/**
 * ASRT's own installed package directory, which must stay readable for its vendored
 * `apply-seccomp` helper to run inside a read-bounded sandbox. Resolved once via the package's
 * `package.json` rather than assumed to sit under any particular `node_modules` layout.
 */
function asrtPackageDir(): string {
  return path.dirname(
    createRequire(import.meta.url).resolve("@anthropic-ai/sandbox-runtime/package.json"),
  );
}

function supervisorPath(): string {
  const ext = path.extname(fileURLToPath(import.meta.url));
  return fileURLToPath(new URL(`./supervisor${ext}`, import.meta.url));
}

/** Bun runs `.ts` natively; Node 22 needs type-stripping for the source supervisor. Dist is `.js`. */
function supervisorArgv(): string[] {
  const file = supervisorPath();
  if (path.extname(file) === ".ts" && !("bun" in process.versions)) {
    return ["--experimental-strip-types", file];
  }
  return [file];
}

function isSupervisorEvent(value: unknown): value is AsrtSupervisorEvent {
  if (typeof value !== "object" || value === null || !("type" in value) || !("id" in value)) {
    return false;
  }
  const type = (value as { type: unknown }).type;
  return type === "ready" || type === "update" || type === "error" || type === "bye";
}

type Pending =
  | { kind: "init"; resolve: () => void; reject: (error: unknown) => void }
  | {
      kind: "run";
      push: (update: BashExecutorUpdate) => void;
      close: () => void;
      fail: (error: unknown) => void;
      cleanup: () => void;
    };

/**
 * One supervisor child that owns this executor's `SandboxManager`. Isolated from every
 * other `createAsrtBashExecutor` in the host process. Dies when stdin closes — including
 * when the host process is gone (the kernel closes the pipe).
 */
class AsrtSupervisorClient {
  private readonly child: ChildProcess;
  private readonly pending = new Map<string, Pending>();
  private nextId = 0;
  private closed = false;

  private constructor(child: ChildProcess) {
    this.child = child;
    if (!child.stdout || !child.stdin) {
      throw new AdlError("INIT_FAILED", "asrt-supervisor: expected piped stdin and stdout");
    }
    attachNdjsonReader(
      child.stdout,
      (value) => this.onEvent(value),
      (error) => this.failAll(error),
    );
    child.on("exit", (code, signal) => {
      if (this.closed) {
        return;
      }
      this.failAll(
        new AdlError(
          "INIT_FAILED",
          `asrt-supervisor exited unexpectedly (code=${code}, signal=${signal})`,
        ),
      );
    });
    child.on("error", (error) => this.failAll(error));
  }

  static async start(
    config: SandboxRuntimeConfig,
    sandboxEnv: Record<string, string>,
  ): Promise<AsrtSupervisorClient> {
    const child = spawn(process.execPath, supervisorArgv(), {
      stdio: ["pipe", "pipe", "inherit"],
    });
    const client = new AsrtSupervisorClient(child);
    try {
      const id = client.allocId();
      await new Promise<void>((resolve, reject) => {
        client.pending.set(id, { kind: "init", resolve, reject });
        client.send({ id, type: "init", config, sandboxEnv });
      });
      return client;
    } catch (error) {
      await client.dispose();
      throw error;
    }
  }

  run(
    argv: readonly string[],
    cwd: string,
    timeoutMs: number,
    maxOutputBytes: number,
    signal: AbortSignal | undefined,
    channel: {
      push: (update: BashExecutorUpdate) => void;
      close: () => void;
      fail: (error: unknown) => void;
    },
  ): void {
    const id = this.allocId();
    const onAbort = () => {
      try {
        this.send({ id, type: "abort" });
      } catch {
        // supervisor already gone
      }
    };
    const cleanup = () => signal?.removeEventListener("abort", onAbort);
    this.pending.set(id, { kind: "run", ...channel, cleanup });
    if (signal) {
      if (signal.aborted) {
        onAbort();
      } else {
        signal.addEventListener("abort", onAbort);
      }
    }
    this.send({ id, type: "run", argv, cwd, timeoutMs, maxOutputBytes });
  }

  async dispose(): Promise<void> {
    if (this.closed) {
      return;
    }
    this.closed = true;
    try {
      this.send({ id: this.allocId(), type: "shutdown" });
    } catch {
      // stdin already closed
    }
    this.child.stdin?.end();
    if (this.child.exitCode !== null || this.child.signalCode !== null) {
      return;
    }
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        this.child.kill("SIGKILL");
        resolve();
      }, 5_000);
      timer.unref();
      this.child.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  private allocId(): string {
    this.nextId += 1;
    return String(this.nextId);
  }

  private send(request: AsrtSupervisorRequest): void {
    if (!this.child.stdin || this.child.stdin.destroyed) {
      throw new AdlError("INIT_FAILED", "asrt-supervisor: stdin is closed");
    }
    writeNdjson(this.child.stdin, request);
  }

  private onEvent(value: unknown): void {
    if (!isSupervisorEvent(value)) {
      this.failAll(new AdlError("INIT_FAILED", "asrt-supervisor: malformed event"));
      return;
    }
    if (value.type === "bye") {
      return;
    }
    const waiter = this.pending.get(value.id);
    if (!waiter) {
      return;
    }
    if (value.type === "error") {
      this.pending.delete(value.id);
      const error = value.code
        ? new AdlError(value.code, value.message)
        : new AdlError("INIT_FAILED", value.message);
      if (waiter.kind === "init") {
        waiter.reject(error);
      } else {
        waiter.cleanup();
        waiter.fail(error);
      }
      return;
    }
    if (value.type === "ready") {
      this.pending.delete(value.id);
      if (waiter.kind === "init") {
        waiter.resolve();
      }
      return;
    }
    if (waiter.kind !== "run") {
      return;
    }
    waiter.push(value.update);
    if (value.update.done) {
      this.pending.delete(value.id);
      waiter.cleanup();
      waiter.close();
    }
  }

  private failAll(error: unknown): void {
    for (const [id, waiter] of this.pending) {
      this.pending.delete(id);
      if (waiter.kind === "init") {
        waiter.reject(error);
      } else {
        waiter.cleanup();
        waiter.fail(error);
      }
    }
  }
}

/**
 * ASRT-backed `BashExecutor`. Each instance spawns a supervisor child that owns its own
 * `SandboxManager`, so two executors can have different filesystem and domain policies in
 * one host process. The supervisor exits when this executor is disposed or the host process
 * dies (stdin keepalive). `SandboxManager.reset()` in the host process does not affect it.
 */
export function createAsrtBashExecutor(options: AsrtBashExecutorOptions): BashExecutor {
  const allowWrite = options.allowWrite.map((p) => path.resolve(p));
  // undefined → allowWrite; null → unbounded; list → that list.
  const allowRead =
    options.allowRead === undefined
      ? allowWrite
      : options.allowRead === null
        ? null
        : options.allowRead.map((p) => path.resolve(p));
  const denyRead = (options.denyRead ?? []).map((p) => path.resolve(p));

  const config: SandboxRuntimeConfig = {
    network: {
      allowedDomains: options.allowedDomains ?? [],
      deniedDomains: options.deniedDomains ?? [],
    },
    filesystem: {
      allowWrite,
      denyRead: allowRead === null ? denyRead : ["/", ...denyRead],
      ...(allowRead === null
        ? {}
        : { allowRead: [...allowRead, asrtPackageDir(), ...existingSystemReadPaths()] }),
      denyWrite: (options.denyWrite ?? []).map((p) => path.resolve(p)),
    },
    // Absolute path so the wrap does not need PATH inside the sandbox. macOS uses
    // sandbox-exec, not bwrap. Soft-resolve so missing-deps still surface via ASRT's
    // checkDependencies (bwrap + socat + ripgrep together) rather than failing at
    // construct on bwrap alone.
    ...(process.platform === "linux"
      ? (() => {
          try {
            return { bwrapPath: resolveCommandOnPath("bwrap") };
          } catch {
            return {};
          }
        })()
      : {}),
  };
  const maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
  const sandboxEnv = resolveAllowEnv(options.allowEnv);

  let clientPromise: Promise<AsrtSupervisorClient> | undefined;

  const ensureClient = (): Promise<AsrtSupervisorClient> => {
    clientPromise ??= AsrtSupervisorClient.start(config, sandboxEnv).catch((error: unknown) => {
      clientPromise = undefined;
      throw error;
    });
    return clientPromise;
  };

  return {
    run(argv, run) {
      const channel = createAsyncChannel<BashExecutorUpdate>();
      void (async () => {
        try {
          if (argv.length === 0) {
            throw new AdlError("INIT_FAILED", "Empty argv for the command to run.");
          }
          const client = await ensureClient();
          client.run(argv, run.cwd, run.timeoutMs, maxOutputBytes, run.signal, channel);
        } catch (error) {
          channel.fail(error);
        }
      })();
      return channel[Symbol.asyncIterator]();
    },

    describe() {
      return {
        backend: "asrt",
        allowWrite: config.filesystem.allowWrite,
        // The roots as the caller asked for them, not the widened set actually handed to
        // ASRT — the system and vendor paths are an implementation detail of enforcing it.
        allowRead,
        denyRead: config.filesystem.denyRead,
        denyWrite: config.filesystem.denyWrite,
        network: {
          allowNetwork: config.network.allowedDomains.length > 0,
          allowedDomains: config.network.allowedDomains,
          deniedDomains: config.network.deniedDomains,
        },
      };
    },

    async dispose() {
      const pending = clientPromise;
      if (!pending) {
        return;
      }
      try {
        const client = await pending;
        await client.dispose();
      } catch {
        // `start()` already disposed the child when init failed.
      } finally {
        if (clientPromise === pending) {
          clientPromise = undefined;
        }
      }
    },
  };
}
