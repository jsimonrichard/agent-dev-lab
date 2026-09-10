/**
 * Pluggable boundary a bash tool runs commands through. Implementations decide the actual
 * isolation strategy (kernel-enforced OS sandbox, bare subprocess, container, ...) — see
 * `notes/tool-sandboxing.md`'s Bash tool section for the tiers and why there's no automatic
 * fallback between them: a project picks one executor explicitly, and a missing prerequisite
 * is a thrown error, never a silent downgrade to a weaker one.
 */
export interface BashExecutor {
  /**
   * Yields zero or more `{ done: false, ... }` progress updates while the command is still
   * running, then exactly one `{ done: true, ... }` final result. An executor that doesn't
   * stream progress can just yield the final result alone — both shapes satisfy the same
   * `AsyncGenerator`, so a caller (e.g. {@link createBashTool}) doesn't need to know which.
   *
   * This return type is exactly what the AI SDK's tool `execute` accepts for a
   * *streaming* tool (`AsyncIterable<OUTPUT>` — see `ai`'s `ToolExecuteFunction`): every
   * yielded value becomes a `preliminary` tool-result, and the last one is re-emitted as the
   * final one. `createBashTool` forwards this generator directly with no wrapping.
   */
  run(
    command: string,
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
}

/** {@link BashExecutor.describe}'s return shape — the sandbox config actually in effect. */
export interface BashExecutorDescription {
  /** Which executor implementation this is, e.g. `"asrt"` or `"native"`. */
  backend: string;
  /** Absolute paths writable inside the sandbox. */
  allowWrite: string[];
  /**
   * Absolute paths reads are confined to, or `null` when this executor is not bounding reads
   * at all (the whole host filesystem is visible read-only). `null` is the honest answer for
   * a backend that *cannot* bound reads — `createAsrtBashExecutor` — rather than reporting an
   * empty list that would read as "nothing is readable."
   *
   * Even when non-`null`, the sandbox still contains the system paths any program needs to
   * execute (`/usr`, `/etc`, the lib directories), so `/etc/passwd` stays readable. The
   * guarantee is "no *user* data outside these roots," not "only these roots."
   */
  allowRead: string[] | null;
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
