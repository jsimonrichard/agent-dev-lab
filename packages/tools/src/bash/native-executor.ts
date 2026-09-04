import { existsSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { AdlError, createAsyncChannel } from "@agent-dev-lab/core";

import type { BashExecutor, BashExecutorUpdate } from "./executor.ts";
import { DEFAULT_MAX_OUTPUT_BYTES, runArgvIntoChannel } from "./process-channel.ts";

export interface NativeBashExecutorOptions {
  /**
   * Paths writable inside the sandbox — e.g. the tool's configured project root. Required,
   * matching `notes/tool-sandboxing.md`'s "no zero-config unsafe default": pass `[]` for a
   * sandbox that can run commands but write nowhere, not an implicit "everything."
   */
  allowWrite: string[];
  /** Paths to hide entirely (not just deny write to), on top of the read-only view of
   * everything else this executor gives by default. */
  denyRead?: string[];
  /**
   * Allow network access. Default `false` (matches ASRT's "no network unless explicitly
   * allowed" posture) — but unlike ASRT, this executor can't filter by domain: it's all
   * network access or none.
   */
  allowNetwork?: boolean;
  /** Bytes to keep from `stdout`/`stderr` each before truncating. Default 1,000,000 (1 MB). */
  maxOutputBytes?: number;
  /**
   * Environment variables available inside the sandbox. Default: a minimal safe subset of
   * this process's own env (`PATH`, `HOME`, `LANG`, `LC_ALL`, `TERM`, `TMPDIR`) — **not** the
   * full `process.env`, which may hold secrets ADL's own `.env` loading put there (this
   * mirrors `notes/tool-sandboxing.md`'s original tier-1 concern about that exact leak).
   */
  env?: Record<string, string>;
}

const DEFAULT_ENV_KEYS = ["PATH", "HOME", "LANG", "LC_ALL", "TERM", "TMPDIR"];

function defaultEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of DEFAULT_ENV_KEYS) {
    const value = process.env[key];
    if (value !== undefined) {
      env[key] = value;
    }
  }
  return env;
}

/**
 * Manually walks `PATH` rather than asking `spawn`/`spawnSync` to resolve the bare command
 * name — verified this actually matters: under Bun, `spawnSync("bwrap", ..., { env: { PATH:
 * "" } })` still finds a real `bwrap` on the *ambient* process PATH despite the empty `env`
 * override (Node's `spawnSync` does not have this quirk — it correctly fails to resolve). A
 * manual `PATH`-segment search is deterministic across both runtimes.
 */
function isOnPath(command: string): boolean {
  const pathEnv = process.env.PATH ?? "";
  return pathEnv
    .split(path.delimiter)
    .filter((segment) => segment.length > 0)
    .some((segment) => existsSync(path.join(segment, command)));
}

// Checked once per process and cached — bubblewrap's presence doesn't change mid-run.
let bwrapAvailable: boolean | undefined;

function checkBwrapAvailable(): void {
  bwrapAvailable ??= isOnPath("bwrap");
  if (!bwrapAvailable) {
    throw new AdlError(
      "INIT_FAILED",
      "bubblewrap (bwrap) not found on PATH. Install: `apt-get install bubblewrap` / " +
        "`dnf install bubblewrap` / `pacman -S bubblewrap`. See notes/tool-sandboxing.md's " +
        "Bash tool section — no automatic fallback to an unsandboxed executor is used.",
    );
  }
}

// A `--ro-bind` source for hiding a *file* path (see `denyReadArgsFor` below) — must be a
// regular file, not `/dev/null`: binding the character device directly produced "Permission
// denied" reads instead of a clean empty file (bwrap's `--dev /dev` mount doesn't carry
// device-node semantics to a bind target outside `/dev`). Created once, lazily, and reused.
let emptyFilePath: string | undefined;

function getEmptyFilePath(): string {
  emptyFilePath ??= (() => {
    const target = path.join(tmpdir(), "adl-native-bash-executor-empty-file");
    writeFileSync(target, "");
    return target;
  })();
  return emptyFilePath;
}

/**
 * Args to hide one `denyRead` path. `--tmpfs` (an empty directory) is right for a directory or
 * a path that doesn't exist; for an existing *file*, `--tmpfs` would turn it into an empty
 * *directory* instead of hiding it as a file — confusing for anything that checks the path's
 * type — so an existing file gets an actual empty regular file bound over it instead.
 */
function denyReadArgsFor(resolvedPath: string): string[] {
  const isDirectoryOrMissing = !existsSync(resolvedPath) || statSync(resolvedPath).isDirectory();
  return isDirectoryOrMissing
    ? ["--tmpfs", resolvedPath]
    : ["--ro-bind", getEmptyFilePath(), resolvedPath];
}

/**
 * Builds a `bwrap` invocation. Bind-mount ordering matters and mirrors bwrap's own
 * last-one-wins-at-a-path semantics:
 *
 * 1. `--ro-bind / /` — the whole host filesystem, read-only, so ordinary commands (`ls`,
 *    `cat`, compilers, whatever's already on the machine) just work.
 * 2. `--dev`/`--proc`/`--tmpfs /tmp` — a fresh `/dev`, `/proc`, and an empty, ephemeral,
 *    writable `/tmp` (vanishes with the sandbox; never the host's real `/tmp`, even for an
 *    `allowWrite`/`denyRead` path that happens to live under `/tmp` — those still need their
 *    own bind below, applied after this tmpfs, to be reachable at all).
 * 3. `allowWrite` binds (`--bind`, read-write) — override the read-only base at those paths.
 * 4. `denyRead` binds (see `denyReadArgsFor`, hiding the path entirely) — applied *after*
 *    `allowWrite`, so an explicit deny always wins over a broader allow, even one nested
 *    inside it (mirrors ASRT's own "denyWrite takes precedence over allowWrite" tie-break;
 *    here it's denyRead over allowWrite).
 * 5. `--unshare-all` (every namespace, including network) then `--share-net` added back only
 *    if `allowNetwork` — network access here is all-or-nothing, no per-domain filtering.
 */
function buildBwrapArgv(
  command: string,
  cwd: string,
  allowWrite: string[],
  denyRead: string[],
  allowNetwork: boolean,
): string[] {
  const argv = [
    "bwrap",
    "--ro-bind",
    "/",
    "/",
    "--dev",
    "/dev",
    "--proc",
    "/proc",
    "--tmpfs",
    "/tmp",
  ];
  for (const p of allowWrite) {
    argv.push("--bind", p, p);
  }
  for (const p of denyRead) {
    argv.push(...denyReadArgsFor(p));
  }
  argv.push("--unshare-all");
  if (allowNetwork) {
    argv.push("--share-net");
  }
  argv.push("--die-with-parent", "--new-session", "--chdir", cwd);
  argv.push("--", "/bin/bash", "-c", command);
  return argv;
}

/**
 * `BashExecutor` backed directly by an OS sandboxing primitive — Bubblewrap (`bwrap`) on
 * Linux. The non-default alternative to `createAsrtBashExecutor` per
 * `notes/tool-sandboxing.md`: no npm dependency, no network-proxy layer, but network access is
 * all-or-nothing (no per-domain allowlist) and there's no violation logging.
 *
 * **macOS is not implemented yet.** `sandbox-exec`/SBPL needs to be built and verified on an
 * actual Mac, which this development environment doesn't have — shipping an unverified
 * low-level sandboxing profile is worse than not shipping one. Constructing this executor on
 * macOS throws a clear "not implemented" error rather than silently doing nothing; use
 * `createAsrtBashExecutor` there instead.
 *
 * Every property here (filesystem, network) is verified directly against real `bwrap` — see
 * `native-executor.test.ts` — rather than assumed from the flag names.
 */
export function createNativeBashExecutor(options: NativeBashExecutorOptions): BashExecutor {
  if (process.platform === "darwin") {
    throw new AdlError(
      "INIT_FAILED",
      "createNativeBashExecutor's macOS (sandbox-exec) backend is not implemented yet — only " +
        "Linux (bwrap) is built and verified so far. Use createAsrtBashExecutor instead, or " +
        "wait for macOS support.",
    );
  }
  if (process.platform !== "linux") {
    throw new AdlError(
      "INIT_FAILED",
      `createNativeBashExecutor has no backend for platform "${process.platform}" — only ` +
        "Linux (bwrap) is supported.",
    );
  }

  const allowWrite = options.allowWrite.map((p) => path.resolve(p));
  const denyRead = (options.denyRead ?? []).map((p) => path.resolve(p));
  const allowNetwork = options.allowNetwork ?? false;
  const maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
  const env = options.env ?? defaultEnv();

  return {
    run(command, run) {
      const channel = createAsyncChannel<BashExecutorUpdate>();
      try {
        checkBwrapAvailable();
        const argv = buildBwrapArgv(command, run.cwd, allowWrite, denyRead, allowNetwork);
        runArgvIntoChannel(argv, env, run, maxOutputBytes, channel);
      } catch (error) {
        channel.fail(error);
      }
      return channel[Symbol.asyncIterator]();
    },

    describe() {
      return {
        backend: "native",
        allowWrite,
        denyRead,
        // No denyWrite option exists on this executor — allowWrite is the only write surface.
        denyWrite: [],
        // All-or-nothing network, no per-domain allow/deny list (unlike ASRT).
        network: { allowNetwork },
      };
    },
  };
}
