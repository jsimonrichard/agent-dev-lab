import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";

import { AdlError, createAsyncChannel } from "@agent-dev-lab/core";
import {
  SandboxManager,
  type SandboxDependencyCheck,
  type SandboxRuntimeConfig,
} from "@anthropic-ai/sandbox-runtime";

import type { BashExecutor, BashExecutorUpdate } from "./executor.ts";
import { DEFAULT_MAX_OUTPUT_BYTES, runArgvIntoChannel } from "./process-channel.ts";
import { existingSystemReadPaths } from "./read-bounds.ts";

export interface AsrtBashExecutorOptions {
  /**
   * Paths writable inside the sandbox — e.g. the tool's configured project root. Required,
   * matching `notes/tool-sandboxing.md`'s "no zero-config unsafe default": pass `[]` for a
   * sandbox that can run commands but write nowhere, not an implicit "everything."
   */
  allowWrite: string[];
  /** Paths to deny read, on top of whatever ASRT denies by default (e.g. `~/.ssh`). */
  denyRead?: string[];
  /**
   * Confine **reads** to these paths. Omitted — the default — leaves reads unbounded, which
   * is ASRT's own default ("read access is allowed everywhere").
   *
   * ASRT expresses this as deny-then-allow, where `allowRead` re-allows within a denied
   * region and takes precedence over `denyRead` (the opposite of write). This executor
   * supplies the broad denial for you — `denyRead: ["/"]` — so the option means the same
   * thing here as on `createNativeBashExecutor`: reads are confined to these roots, rather
   * than being a modifier whose effect depends on a `denyRead` the caller had to think to
   * write. Any `denyRead` you pass is still applied on top, and stays denied even inside an
   * allowed root when it is the more specific path.
   *
   * `existingSystemReadPaths()` and ASRT's own package directory are re-allowed
   * automatically: without the former nothing can execute, and without the latter ASRT's
   * vendored `apply-seccomp` helper is hidden from the sandbox it is setting up (verified —
   * the command dies with exit 127 before it starts).
   */
  allowRead?: string[];
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
 * ASRT's own installed package directory, which must stay readable for its vendored
 * `apply-seccomp` helper to run inside a read-bounded sandbox. Resolved once via the package's
 * `package.json` rather than assumed to sit under any particular `node_modules` layout.
 */
function asrtPackageDir(): string {
  return path.dirname(
    createRequire(import.meta.url).resolve("@anthropic-ai/sandbox-runtime/package.json"),
  );
}

export function createAsrtBashExecutor(options: AsrtBashExecutorOptions): BashExecutor {
  const allowRead = options.allowRead?.map((p) => path.resolve(p)) ?? null;
  const denyRead = (options.denyRead ?? []).map((p) => path.resolve(p));

  const config: SandboxRuntimeConfig = {
    network: {
      allowedDomains: options.allowedDomains ?? [],
      deniedDomains: options.deniedDomains ?? [],
    },
    filesystem: {
      allowWrite: options.allowWrite.map((p) => path.resolve(p)),
      // Reads are allowed everywhere until something denies them, so bounding them means
      // denying "/" and carving the roots back out — see `allowRead`'s doc comment.
      denyRead: allowRead === null ? denyRead : ["/", ...denyRead],
      ...(allowRead === null
        ? {}
        : { allowRead: [...allowRead, asrtPackageDir(), ...existingSystemReadPaths()] }),
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
    run(argv, run) {
      const channel = createAsyncChannel<BashExecutorUpdate>();

      void (async () => {
        try {
          if (argv.length === 0) {
            throw new AdlError("INIT_FAILED", "Empty argv for the command to run.");
          }
          await ensureInitialized();
          const commandId = randomUUID();
          // wrapWithSandboxArgv takes a command *string* (the "Argv" in the name is its
          // return shape). Putting each element in the spawn env and exec'ing the
          // `$ADL_ARGV_*` refs means the values never appear in that string — they are
          // not shell-parsed. Named because there is no upstream argv-in API.
          const extraEnv: Record<string, string> = {};
          const refs: string[] = [];
          for (const [i, arg] of argv.entries()) {
            const key = `ADL_ARGV_${String(i)}`;
            extraEnv[key] = arg;
            refs.push(`"$${key}"`);
          }
          const { argv: sandboxArgv, env } = await SandboxManager.wrapWithSandboxArgv(
            `exec ${refs.join(" ")}`,
            undefined,
            undefined,
            run.signal,
            run.cwd,
            { commandId },
          );
          runArgvIntoChannel(
            sandboxArgv,
            { ...env, ...extraEnv },
            run,
            maxOutputBytes,
            channel,
            (rawStderr) => SandboxManager.annotateStderrWithSandboxFailures(commandId, rawStderr),
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
  };
}
