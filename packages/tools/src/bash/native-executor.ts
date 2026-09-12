import { existsSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { AdlError, createAsyncChannel } from "@agent-dev-lab/core";

import { UNBOUNDED_ALLOW_READ } from "../unbounded-allow-read.ts";
import { resolveAllowEnv, type AllowEnv } from "./allow-env.ts";
import type { BashExecutor, BashExecutorUpdate } from "./executor.ts";
import { DEFAULT_MAX_OUTPUT_BYTES, runArgvIntoChannel } from "./process-channel.ts";
import { existingSystemReadPaths } from "./read-bounds.ts";
import { resolveCommandOnPath } from "./resolve-command.ts";

export interface NativeBashExecutorOptions {
  /**
   * Paths writable inside the sandbox — e.g. the tool's configured project root. Required,
   * matching the no-unsandboxed-default rule: pass `[]` for a
   * sandbox that can run commands but write nowhere, not an implicit "everything."
   */
  allowWrite: string[];
  /** Paths to hide entirely (not just deny write to), on top of the read-only view of
   * everything else this executor gives by default. */
  denyRead?: string[];
  /**
   * Confine **reads** to these paths (plus system paths below). Omitted — escape-hatch
   * default — confines reads to `allowWrite` (executors have no cwd). Providers fill
   * omitted reads with `[cwd]` via `mergePolicy` before pooling. Pass
   * {@link UNBOUNDED_ALLOW_READ} for host-wide reads (`--ro-bind / /`). `null` / `[]`
   * mean no user read roots (system paths still mounted so commands can run).
   *
   * Unlike `denyRead`, which is a deny-list and therefore only ever as complete as its
   * author, a list is an **allow**-list enforced by the kernel: a path outside it is not
   * "permission denied" but genuinely *absent* from the mount namespace — `ls` reports
   * `No such file or directory`. That is what makes it suitable as the read boundary for a
   * recursive reader like `rg`, where enumerating everything to deny is hopeless.
   *
   * {@link SYSTEM_READ_PATHS} stay bound whenever reads are bounded, since nothing can
   * execute without them; see {@link BashExecutorDescription.allowRead} for what that
   * means for the guarantee.
   */
  allowRead?: string[] | null | typeof UNBOUNDED_ALLOW_READ;
  /**
   * Allow network access. Default `false` (matches ASRT's "no network unless explicitly
   * allowed" posture) — but unlike ASRT, this executor can't filter by domain: it's all
   * network access or none.
   */
  allowNetwork?: boolean;
  /** Bytes to keep from `stdout`/`stderr` each before truncating. Default 1,000,000 (1 MB). */
  maxOutputBytes?: number;
  /**
   * Host environment variables to expose inside the sandbox. Omitted / `[]` → none
   * (`printenv` is empty aside from what the command itself sets). `true` → every
   * string-valued host var. A list matches names (literal, glob, or `RegExp`).
   */
  allowEnv?: AllowEnv;
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
 * 1. The read base — either `--ro-bind / /` (the whole host filesystem, read-only, so
 *    ordinary commands just work) when `allowRead` is {@link UNBOUNDED_ALLOW_READ}, or, when
 *    it is a list (including the omitted-default-to-`allowWrite` case), only
 *    {@link SYSTEM_READ_PATHS}, so everything else is absent from the namespace until a
 *    later bind puts it back.
 * 2. `--dev`/`--proc`/`--tmpfs /tmp` — a fresh `/dev`, `/proc`, and an empty, ephemeral,
 *    writable `/tmp` (vanishes with the sandbox; never the host's real `/tmp`, even for an
 *    `allowWrite`/`denyRead` path that happens to live under `/tmp` — those still need their
 *    own bind below, applied after this tmpfs, to be reachable at all).
 * 3. `allowRead` binds (`--ro-bind`) — added *after* the tmpfs, which matters: a root under
 *    `/tmp` would otherwise be wiped by step 2 and simply not exist (verified).
 * 4. `allowWrite` binds (`--bind`, read-write) — override the read-only base at those paths.
 * 5. `denyRead` binds (see `denyReadArgsFor`, hiding the path entirely) — applied *after*
 *    `allowWrite`, so an explicit deny always wins over a broader allow, even one nested
 *    inside it (mirrors ASRT's own "denyWrite takes precedence over allowWrite" tie-break;
 *    here it's denyRead over allowWrite).
 * 6. `--unshare-all` (every namespace, including network) then `--share-net` added back only
 *    if `allowNetwork` — network access here is all-or-nothing, no per-domain filtering.
 * 7. `--clearenv` then `--setenv` for each allowed host var — the host PATH used to *find*
 *    bwrap does not enter the sandbox.
 */
function buildBwrapArgv(
  bwrapPath: string,
  commandArgv: readonly string[],
  cwd: string,
  allowWrite: string[],
  allowRead: string[] | typeof UNBOUNDED_ALLOW_READ,
  denyRead: string[],
  allowNetwork: boolean,
  sandboxEnv: Readonly<Record<string, string>>,
): string[] {
  const argv = [bwrapPath];
  if (allowRead === UNBOUNDED_ALLOW_READ) {
    argv.push("--ro-bind", "/", "/");
  } else {
    for (const p of existingSystemReadPaths()) {
      argv.push("--ro-bind", p, p);
    }
  }
  argv.push("--dev", "/dev", "--proc", "/proc", "--tmpfs", "/tmp");
  if (allowRead !== UNBOUNDED_ALLOW_READ) {
    for (const p of allowRead) {
      argv.push("--ro-bind", p, p);
    }
  }
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
  argv.push("--clearenv");
  for (const [key, value] of Object.entries(sandboxEnv)) {
    argv.push("--setenv", key, value);
  }
  argv.push("--die-with-parent", "--new-session", "--chdir", cwd);
  argv.push("--", ...commandArgv);
  return argv;
}

/**
 * `BashExecutor` backed directly by an OS sandboxing primitive — Bubblewrap (`bwrap`) on
 * Linux. The non-default alternative to `createAsrtBashExecutor`: no npm dependency, no
 * network-proxy layer, but network access is all-or-nothing (no per-domain allowlist) and
 * there's no violation logging.
 *
 * **macOS is not implemented yet.** Constructing this executor on macOS throws a clear
 * "not implemented" error rather than silently doing nothing; use `createAsrtBashExecutor`
 * there instead.
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

  let bwrapPath: string;
  try {
    bwrapPath = resolveCommandOnPath("bwrap");
  } catch (error) {
    if (error instanceof AdlError) {
      throw new AdlError(
        "INIT_FAILED",
        "bubblewrap (bwrap) not found on PATH. Install: `apt-get install bubblewrap` / " +
          "`dnf install bubblewrap` / `pacman -S bubblewrap`. No automatic fallback to an " +
          "unsandboxed executor is used.",
      );
    }
    throw error;
  }

  const allowWrite = options.allowWrite.map((p) => path.resolve(p));
  // Omitted allowRead → allowWrite. Providers always pass a concrete list (`[cwd]` by
  // default) via mergePolicy; this fallback is for escape-hatch construction only (no cwd).
  // null → deny-all ([]). UNBOUNDED_ALLOW_READ → host-wide.
  const allowRead: string[] | typeof UNBOUNDED_ALLOW_READ =
    options.allowRead === undefined
      ? allowWrite
      : options.allowRead === UNBOUNDED_ALLOW_READ
        ? UNBOUNDED_ALLOW_READ
        : options.allowRead === null
          ? []
          : options.allowRead.map((p) => path.resolve(p));
  const denyRead = (options.denyRead ?? []).map((p) => path.resolve(p));
  const allowNetwork = options.allowNetwork ?? false;
  const maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
  const sandboxEnv = resolveAllowEnv(options.allowEnv);

  return {
    run(argv, run) {
      const channel = createAsyncChannel<BashExecutorUpdate>();
      try {
        if (argv.length === 0) {
          throw new AdlError("INIT_FAILED", "Empty argv for the command to run.");
        }
        const bwrapArgv = buildBwrapArgv(
          bwrapPath,
          argv,
          run.cwd,
          allowWrite,
          allowRead,
          denyRead,
          allowNetwork,
          sandboxEnv,
        );
        // Absolute bwrap path — spawn env need not carry PATH into the host process tree.
        runArgvIntoChannel(bwrapArgv, {}, run, maxOutputBytes, channel);
      } catch (error) {
        channel.fail(error);
      }
      return channel[Symbol.asyncIterator]();
    },

    describe() {
      return {
        backend: "native",
        allowWrite,
        allowRead,
        denyRead,
        // No denyWrite option exists on this executor — allowWrite is the only write surface.
        denyWrite: [],
        // All-or-nothing network, no per-domain allow/deny list (unlike ASRT).
        network: { allowNetwork },
      };
    },
  };
}
