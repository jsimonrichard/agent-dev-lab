import { spawn } from "node:child_process";
import { constants as osConstants } from "node:os";

import { AdlError, type AsyncChannel } from "@agent-dev-lab/core";

import type { BashExecutorRunOptions, BashExecutorUpdate } from "./executor.ts";

export const DEFAULT_MAX_OUTPUT_BYTES = 1_000_000;

function truncatingAppend(
  buffer: Buffer<ArrayBufferLike>,
  chunk: Buffer<ArrayBufferLike>,
  maxBytes: number,
): { buffer: Buffer<ArrayBufferLike>; truncated: boolean } {
  if (buffer.length >= maxBytes) {
    return { buffer, truncated: true };
  }
  const combined = Buffer.concat([buffer, chunk]);
  if (combined.length > maxBytes) {
    return { buffer: combined.subarray(0, maxBytes), truncated: true };
  }
  return { buffer: combined, truncated: false };
}

function exitCodeFor(code: number | null, signal: NodeJS.Signals | null): number {
  if (code !== null) {
    return code;
  }
  // A signalled child (killed on timeout/abort) has a null exit code — 128 + signal number
  // mirrors the POSIX shell convention, falling back to 128 if the signal name isn't in the
  // lookup table for some reason.
  return 128 + (signal ? (osConstants.signals[signal] ?? 0) : 0);
}

/**
 * Spawns `argv` and pushes {@link BashExecutorUpdate}s onto `channel` as output arrives: a
 * `{ done: false, ... }` progress snapshot per `stdout`/`stderr` chunk (cumulative, not a
 * delta), then one final `{ done: true, ... }` on exit. `channel.fail` on a spawn error; the
 * channel is always closed before this returns, one way or another.
 *
 * Shared by every `BashExecutor` implementation in this package — the only thing that differs
 * between them is how `argv`/`env` get built (ASRT's `wrapWithSandboxArgv`, `bwrap`/
 * `sandbox-exec` argv assembled directly, ...); once you have those, running the process and
 * streaming its output is identical.
 */
export function runArgvIntoChannel(
  argv: string[],
  env: NodeJS.ProcessEnv,
  run: BashExecutorRunOptions,
  maxOutputBytes: number,
  channel: Pick<AsyncChannel<BashExecutorUpdate>, "push" | "close" | "fail">,
  annotateStderr: (rawStderr: string) => string = (rawStderr) => rawStderr,
): void {
  const [file, ...args] = argv;
  if (!file) {
    channel.fail(new AdlError("INIT_FAILED", "Empty argv for the command to run."));
    return;
  }

  const child = spawn(file, args, { cwd: run.cwd, env, signal: run.signal });
  let stdout: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  let stderr: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  let truncated = false;

  const pushProgress = () => {
    channel.push({
      done: false,
      stdout: stdout.toString("utf8"),
      stderr: annotateStderr(stderr.toString("utf8")),
      truncated,
    });
  };

  child.stdout?.on("data", (chunk: Buffer) => {
    const next = truncatingAppend(stdout, chunk, maxOutputBytes);
    stdout = next.buffer;
    truncated ||= next.truncated;
    pushProgress();
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    const next = truncatingAppend(stderr, chunk, maxOutputBytes);
    stderr = next.buffer;
    truncated ||= next.truncated;
    pushProgress();
  });

  const timer = setTimeout(() => {
    child.kill("SIGKILL");
  }, run.timeoutMs);
  timer.unref();

  child.on("error", (error) => {
    clearTimeout(timer);
    channel.fail(error);
  });
  child.on("exit", (code, signal) => {
    clearTimeout(timer);
    channel.push({
      done: true,
      stdout: stdout.toString("utf8"),
      stderr: annotateStderr(stderr.toString("utf8")),
      exitCode: exitCodeFor(code, signal),
      truncated,
    });
    channel.close();
  });
}
