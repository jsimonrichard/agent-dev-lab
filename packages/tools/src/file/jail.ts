import { realpath } from "node:fs/promises";
import path from "node:path";

import { AdlError } from "@agent-dev-lab/core";

/**
 * Confines file access to a configured root. Every requested path is resolved against the
 * root and checked (after symlink resolution) to still be inside it. Defends against
 * `..` traversal and a symlink planted inside the jail pointing outside it.
 *
 * **Known limitation (TOCTOU):** this is a check-then-use pattern, not a kernel-enforced
 * boundary — there's a window between a `resolve*` call's `realpath` check and the caller's
 * actual `readFile`/`writeFile` on that same path where a concurrent filesystem change (e.g.
 * something swaps a symlink into place) could in principle slip through. A fully closed
 * version would operate on a file descriptor (`open` → `fstat`/`read`) instead of a path, so
 * there's no gap between check and use; this package doesn't do that yet. Matches the threat
 * model this jail is scoped to (the *model* is the adversary, via tool-call arguments — not a
 * concurrent local filesystem race) but is worth knowing if that threat model ever changes.
 * A subprocess-level, kernel-enforced sandbox (e.g. Landlock, `sandbox-exec`) doesn't have
 * this gap; this jail does.
 *
 * **Platform support:** tested on Linux and macOS only. Windows is untested and not
 * currently supported — `path.isAbsolute`/`path.relative`/`path.sep` behave differently
 * there (drive letters, UNC paths, case-insensitive-but-case-preserving filesystems), and
 * none of that has been verified.
 */
export interface FileJail {
  /** The jail root, resolved to an absolute path (not yet symlink-resolved). */
  readonly root: string;
  /**
   * Resolve `requestedPath` (relative to the root) to an absolute, symlink-resolved path,
   * for a file that must already exist. Throws `AdlError("INVALID_INPUT", …)` if the path is
   * absolute, escapes the root, or doesn't exist.
   */
  resolveExisting(requestedPath: string): Promise<string>;
  /**
   * Resolve `requestedPath` to an absolute, symlink-resolved path for a file that may not
   * exist yet — the file itself isn't symlink-resolved (it may not exist), but its parent
   * directory is, and must already exist. Throws `AdlError("INVALID_INPUT", …)` if the path
   * is absolute, escapes the root, or its parent directory doesn't exist.
   */
  resolveForWrite(requestedPath: string): Promise<string>;
}

function rejectEscape(requestedPath: string, root: string): never {
  throw new AdlError("INVALID_INPUT", `Path "${requestedPath}" escapes the sandbox root "${root}"`);
}

function assertWithinRoot(candidate: string, realRoot: string, requestedPath: string): void {
  const relative = path.relative(realRoot, candidate);
  const escapes =
    relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative);
  if (escapes) {
    rejectEscape(requestedPath, realRoot);
  }
}

/**
 * `path.resolve(root, requestedPath)` silently discards `root` if `requestedPath` is itself
 * absolute (Node resolves right-to-left) — so an absolute `requestedPath` must be rejected
 * before it ever reaches `path.resolve`, not caught after the fact.
 */
function resolveWithinRoot(rawRoot: string, requestedPath: string): string {
  if (path.isAbsolute(requestedPath)) {
    throw new AdlError(
      "INVALID_INPUT",
      `Path must be relative to the sandbox root, got an absolute path: "${requestedPath}"`,
    );
  }
  return path.resolve(rawRoot, requestedPath);
}

export function createFileJail(root: string): FileJail {
  const rawRoot = path.resolve(root);
  // Resolved once, lazily, and cached — every call after the first reuses the same promise.
  let realRootPromise: Promise<string> | undefined;
  const getRealRoot = (): Promise<string> => {
    realRootPromise ??= realpath(rawRoot);
    return realRootPromise;
  };

  return {
    root: rawRoot,
    async resolveExisting(requestedPath) {
      const realRoot = await getRealRoot();
      const candidate = resolveWithinRoot(rawRoot, requestedPath);
      assertWithinRoot(candidate, realRoot, requestedPath);
      let real: string;
      try {
        real = await realpath(candidate);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          throw new AdlError("INVALID_INPUT", `File not found: "${requestedPath}"`, {
            cause: error,
          });
        }
        throw error;
      }
      assertWithinRoot(real, realRoot, requestedPath);
      return real;
    },
    async resolveForWrite(requestedPath) {
      const realRoot = await getRealRoot();
      const candidate = resolveWithinRoot(rawRoot, requestedPath);
      assertWithinRoot(candidate, realRoot, requestedPath);
      const parent = path.dirname(candidate);
      let realParent: string;
      try {
        realParent = await realpath(parent);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          throw new AdlError(
            "INVALID_INPUT",
            `Parent directory does not exist: "${path.dirname(requestedPath)}"`,
            { cause: error },
          );
        }
        throw error;
      }
      assertWithinRoot(realParent, realRoot, requestedPath);
      return path.join(realParent, path.basename(candidate));
    },
  };
}
