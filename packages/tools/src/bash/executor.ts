/**
 * Pluggable boundary a bash tool runs commands through. Implementations decide the actual
 * isolation strategy (kernel-enforced OS sandbox, bare subprocess, container, ...).
 * A project picks one executor explicitly; a missing prerequisite is a thrown error,
 * never a silent downgrade to a weaker one.
 */
import { UNBOUNDED_ALLOW_READ } from "../unbounded-allow-read.ts";

export interface BashExecutor {
  /**
   * Yields zero or more `{ done: false, ... }` progress updates while the command is still
   * running, then exactly one `{ done: true, ... }` final result. An executor that doesn't
   * stream progress can just yield the final result alone — both shapes satisfy the same
   * `AsyncGenerator`, so a caller (e.g. {@link createBashTool}) doesn't need to know which.
   *
   * `argv` is spawned as-is — no shell. A caller that *wants* a shell (the model-facing
   * `bash` tool) passes `["/bin/bash", "-c", command]`. Empty argv is an invariant break
   * (`AdlError("INIT_FAILED")`), not a no-op.
   *
   * This return type is exactly what the AI SDK's tool `execute` accepts for a
   * *streaming* tool (`AsyncIterable<OUTPUT>` — see `ai`'s `ToolExecuteFunction`): every
   * yielded value becomes a `preliminary` tool-result, and the last one is re-emitted as the
   * final one. `createBashTool` forwards this generator directly with no wrapping.
   */
  run(
    argv: readonly string[],
    options: BashExecutorRunOptions,
  ): AsyncGenerator<BashExecutorUpdate, void, void>;

  /**
   * Reports this executor's actual, resolved configuration — for the `describeEnvironment`
   * tool (`createBashToolProvider`/`createWorkspaceToolProvider`) to give the model situational
   * awareness of what it can and can't do, instead of it only discovering limits by hitting a
   * denial. Every concrete executor already holds this in closure; `describe()` just returns
   * it, no new computation.
   */
  describe(): BashExecutorDescription;

  /**
   * Releases long-lived resources this executor holds (the ASRT supervisor child,
   * for example). Optional: executors with nothing to release omit it. Safe to call
   * more than once. After dispose, a later `run()` may start fresh resources.
   */
  dispose?(): Promise<void>;
}

/** {@link BashExecutor.describe}'s return shape — the sandbox config actually in effect. */
export interface BashExecutorDescription {
  /** Which executor implementation this is, e.g. `"asrt"` or `"native"`. */
  backend: string;
  /** Absolute paths writable inside the sandbox. */
  allowWrite: string[];
  /**
   * Absolute paths reads are confined to, or {@link UNBOUNDED_ALLOW_READ} when this
   * executor is not bounding reads (host filesystem visible read-only). `[]` means
   * nothing user-facing is readable (system paths may still be mounted so commands can
   * execute).
   *
   * Escape-hatch executors report `allowWrite` when `allowRead` was omitted, and
   * {@link UNBOUNDED_ALLOW_READ} when the caller opted into host-wide reads. Pooled
   * policy maps omitted `allowRead` to `[cwd]` before construction.
   *
   * Even when a list is set, the sandbox still contains the system paths any program
   * needs to execute (`/usr`, `/etc`, the lib directories), so `/etc/passwd` stays readable.
   * The guarantee is "no *user* data outside these roots," not "only these roots."
   */
  allowRead: string[] | typeof UNBOUNDED_ALLOW_READ;
  /** Absolute paths hidden from reads, on top of the executor's own defaults. */
  denyRead: string[];
  /** Absolute paths denied write access, on top of `allowWrite` not already covering them. */
  denyWrite: string[];
  network: {
    allowNetwork: boolean;
    /** Domains allowed when `allowNetwork` is true and the executor supports per-domain rules. */
    allowedDomains?: string[];
    deniedDomains?: string[];
  };
}

export interface BashExecutorRunOptions {
  /** Working directory the command runs in. */
  cwd: string;
  /** Wall-clock timeout in milliseconds — the command is killed if it runs past this. */
  timeoutMs: number;
  /** Aborts the command early — wired from the AI SDK tool call's own `abortSignal`. */
  signal?: AbortSignal;
}

/**
 * A progress update while the command is still running. `stdout`/`stderr` are cumulative —
 * everything captured so far, not just what's new since the last update — so a consumer that
 * only reads the latest value still sees the whole output.
 */
export interface BashExecutorProgress {
  done: false;
  stdout: string;
  stderr: string;
  /** `true` if `stdout` or `stderr` has already hit the executor's output byte cap. */
  truncated: boolean;
}

/** The command's finished result — the last value {@link BashExecutor.run} ever yields. */
export interface BashExecutorResult {
  done: true;
  stdout: string;
  stderr: string;
  exitCode: number;
  truncated: boolean;
}

export type BashExecutorUpdate = BashExecutorProgress | BashExecutorResult;
