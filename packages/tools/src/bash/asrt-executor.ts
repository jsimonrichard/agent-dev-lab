import { randomUUID } from "node:crypto";
import path from "node:path";

import { AdlError, createAsyncChannel } from "@agent-dev-lab/core";
import {
  SandboxManager,
  type SandboxDependencyCheck,
  type SandboxRuntimeConfig,
} from "@anthropic-ai/sandbox-runtime";

import type { BashExecutor, BashExecutorUpdate } from "./executor.ts";
import { DEFAULT_MAX_OUTPUT_BYTES, runArgvIntoChannel } from "./process-channel.ts";

export interface AsrtBashExecutorOptions {
  /**
   * Paths writable inside the sandbox — e.g. the tool's configured project root. Required,
   * matching `notes/tool-sandboxing.md`'s "no zero-config unsafe default": pass `[]` for a
   * sandbox that can run commands but write nowhere, not an implicit "everything."
   */
  allowWrite: string[];
  /** Paths to deny read, on top of whatever ASRT denies by default (e.g. `~/.ssh`). */
  denyRead?: string[];
  denyWrite?: string[];
  /** Domains allowed for network access. Omit/empty (the default) means no network access. */
  allowedDomains?: string[];
  deniedDomains?: string[];
  /** Bytes to keep from `stdout`/`stderr` each before truncating. Default 1,000,000 (1 MB). */
  maxOutputBytes?: number;
}

/**
 * Per-platform substring → "how to install this" hint, appended to ASRT's own
 * `checkDependencies()` error text. Matched by substring since ASRT's error strings (e.g.
 * `"bubblewrap (bwrap) not installed"`) are free text, not a structured code per missing tool.
 */
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
      `See notes/tool-sandboxing.md's Bash tool section — no automatic fallback to an ` +
      `unsandboxed executor is used; install the missing dependencies or configure a ` +
      `different BashExecutor.`,
  );
}

/**
 * `BashExecutor` backed by `@anthropic-ai/sandbox-runtime` (ASRT) — the preferred default per
 * `notes/tool-sandboxing.md`. Uses ASRT's library API (`SandboxManager`), not the `srt` CLI
 * binary: the CLI's `commander`-based argv parser misreads a wrapped command's own short
 * flags as its *own* flags (confirmed: `srt curl -sS ...` reads `-sS` as `-s S`, ASRT's
 * `--settings` flag) — a real risk here since the command comes from the model, not a human
 * typing one well-formed invocation.
 *
 * **Process-global state:** `SandboxManager` is a single, process-wide singleton (per its own
 * docs: "Global sandbox manager... for this session") — module-scoped state, not a class, so
 * there is no way to run two independently-configured sandboxes in one process. `initialize()`
 * is itself idempotent: once it has succeeded once, later calls (from a second
 * `createAsrtBashExecutor` with a *different* config) just await the same already-resolved
 * initialization and silently keep the first config — ASRT's own behavior, not something this
 * wrapper adds. So the practical rule is: whichever `createAsrtBashExecutor` call's `run()`
 * executes first wins its config for the whole process; every other instance transparently
 * shares that same sandbox instead of getting its own `allowWrite`/`denyRead`/network settings.
 * Construct one instance per distinct config you actually need, and prefer one shared instance
 * per process when configs would otherwise match.
 *
 * Never calls `SandboxManager.reset()` between commands — doing so would tear down the shared
 * network proxy for every other in-flight or future command in this process, not just the one
 * that just finished.
 *
 * **Caller's responsibility: call `SandboxManager.reset()` yourself when your process is
 * shutting down.** ASRT's own docs describe this as optional, "happens automatically on
 * process exit" — verified directly that this is not reliable: a plain Node script that
 * finishes all its own work and calls nothing else hangs indefinitely rather than exiting
 * (`SandboxManager` holds the process open, most likely via its proxy bridge processes/
 * sockets not being unref'd). `bun test` masked this for a long time — it force-ends the whole
 * process at suite completion regardless of open handles, so no hang was ever visible, but
 * every one of `SandboxManager`'s child processes leaked (confirmed: dozens of orphaned
 * `socat` bridges accumulated silently across many `bun test` runs). `node --test` does not
 * force anything — it waits for a natural exit — so the same code hung indefinitely under it
 * until `asrt-executor.test.ts` added an explicit `SandboxManager.reset()` in its `after()`
 * hook. A real host application (a long-running CLI command, a server) using this executor
 * needs the same: call `SandboxManager.reset()` on its own shutdown path, or it will neither
 * exit cleanly nor release these processes.
 */
export function createAsrtBashExecutor(options: AsrtBashExecutorOptions): BashExecutor {
  const config: SandboxRuntimeConfig = {
    network: {
      allowedDomains: options.allowedDomains ?? [],
      deniedDomains: options.deniedDomains ?? [],
    },
    filesystem: {
      allowWrite: options.allowWrite.map((p) => path.resolve(p)),
      denyRead: (options.denyRead ?? []).map((p) => path.resolve(p)),
      denyWrite: (options.denyWrite ?? []).map((p) => path.resolve(p)),
    },
  };
  const maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;

  let initPromise: Promise<void> | undefined;
  const ensureInitialized = (): Promise<void> => {
    initPromise ??= (async () => {
      const check = SandboxManager.checkDependencies();
      if (check.errors.length > 0) {
        throw dependencyError(check);
      }
      // A no-op if some other createAsrtBashExecutor's run() already initialized
      // SandboxManager first — see this function's doc comment.
      await SandboxManager.initialize(config);
    })();
    return initPromise;
  };

  return {
    run(command, run) {
      const channel = createAsyncChannel<BashExecutorUpdate>();

      void (async () => {
        try {
          await ensureInitialized();
          const commandId = randomUUID();
          const { argv, env } = await SandboxManager.wrapWithSandboxArgv(
            command,
            undefined,
            undefined,
            run.signal,
            run.cwd,
            { commandId },
          );
          runArgvIntoChannel(argv, env, run, maxOutputBytes, channel, (rawStderr) =>
            SandboxManager.annotateStderrWithSandboxFailures(commandId, rawStderr),
          );
        } catch (error) {
          channel.fail(error);
        }
      })();

      return channel[Symbol.asyncIterator]();
    },

    // Reports this instance's own configured `config` — the one actually enforced *unless*
    // another createAsrtBashExecutor already initialized SandboxManager first with a
    // different config (see this function's doc comment); that's already called out as an
    // anti-pattern to avoid, not something worth extra complexity here to detect.
    describe() {
      return {
        backend: "asrt",
        allowWrite: config.filesystem.allowWrite,
        denyRead: config.filesystem.denyRead,
        denyWrite: config.filesystem.denyWrite,
        network: {
          allowNetwork: config.network.allowedDomains.length > 0,
          allowedDomains: config.network.allowedDomains,
          deniedDomains: config.network.deniedDomains,
        },
      };
    },
  };
}
