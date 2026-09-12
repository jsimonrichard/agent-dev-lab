import { realpath } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import { AdlError } from "@agent-dev-lab/core";

import {
  checkPathAccess,
  realpathPathBound,
  resolveAllowReadList,
  resolveAllowWriteList,
  resolveDenyList,
  type PathBound,
  type ResolvedAllowRead,
} from "../fs-bounds.ts";
import { UNBOUNDED_ALLOW_READ } from "../unbounded-allow-read.ts";

/**
 * Read bound for the file jail and file/search factories. Omitted → `[cwd]`.
 * {@link UNBOUNDED_ALLOW_READ} (`"**"`) opts into host-wide reads. `null` / `[]` allow nothing.
 */
export type FileAllowRead = string[] | null | typeof UNBOUNDED_ALLOW_READ;

/**
 * Resolve `allowRead` the same way factories and the jail do: a root list, `[]` for
 * nothing, or {@link UNBOUNDED_ALLOW_READ} for host-wide. Omitted → `[cwd]`.
 */
export function resolveFileAllowRead(
  cwd: string,
  allowRead: FileAllowRead | undefined,
): ResolvedAllowRead {
  return resolveAllowReadList({
    anchor: cwd,
    allowRead,
  });
}

/**
 * Bounds for {@link createFileJail}. Security is allow/deny lists only — `cwd` is the
 * relative-path base (default: home directory), not a privileged root.
 *
 * `allowRead` / `allowWrite` omitted → `[cwd]`. {@link UNBOUNDED_ALLOW_READ} is host-wide
 * reads. `null` / `[]` on read (and `[]` on write) allow nothing. Deny wins over allow,
 * including unbounded read.
 */
export interface FileJailOptions {
  /**
   * Relative-path base only — not a security root.
   * Omitted → `os.homedir()` (expanded `~`, not `/`).
   */
  cwd?: string;
  allowRead?: FileAllowRead;
  denyRead?: string[];
  /** Omitted → `[cwd]`. `[]` → no writes. */
  allowWrite?: string[];
  denyWrite?: string[];
}

/**
 * Confines file access to configured allow/deny path bounds. Every requested path is
 * resolved and checked (after symlink resolution) against those bounds. Defends against
 * `..` traversal and a symlink planted inside an allow root pointing outside it (or into
 * a deny path).
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
  /** Relative-path base, resolved absolute (not yet symlink-resolved). */
  readonly cwd: string;
  /**
   * Resolve `requestedPath` to an absolute, symlink-resolved path for a **read**. The file
   * must already exist. Relative paths resolve against {@link FileJail.cwd}; absolute paths
   * are accepted when they fall within the read policy. Throws `AdlError("INVALID_INPUT", …)`
   * if the path escapes the read bound, is denied, or doesn't exist.
   */
  resolveForRead(requestedPath: string): Promise<string>;
  /**
   * Resolve `requestedPath` to an absolute, symlink-resolved path for a **write**. The parent
   * directory must already exist; the leaf may be missing. When the leaf itself already
   * exists, it is `realpath`'d too so an outbound leaf symlink cannot smuggle a write (or an
   * `editFile` read) outside the write bound. A missing leaf stays parent-only. Absolute
   * paths are allowed when they fall under `allowWrite`. Throws
   * `AdlError("INVALID_INPUT", …)` if the path is denied, outside the write allow list, or
   * its parent directory doesn't exist.
   */
  resolveForWrite(requestedPath: string): Promise<string>;
}

function resolveAgainstCwd(cwd: string, requestedPath: string): string {
  if (path.isAbsolute(requestedPath)) {
    return path.resolve(requestedPath);
  }
  return path.resolve(cwd, requestedPath);
}

function assertBound(
  candidate: string,
  bound: PathBound,
  requestedPath: string,
  denyLabel: "denyRead" | "denyWrite",
  outsideMessage: string,
): void {
  const denial = checkPathAccess(candidate, bound);
  if (denial === undefined) {
    return;
  }
  if (denial.kind === "denied") {
    throw new AdlError(
      "INVALID_INPUT",
      `Path "${requestedPath}" is denied by ${denyLabel} ("${denial.denyRoot}")`,
    );
  }
  throw new AdlError("INVALID_INPUT", outsideMessage);
}

export function createFileJail(options: FileJailOptions = {}): FileJail {
  const cwd = path.resolve(options.cwd ?? homedir());
  const readBound: PathBound = {
    allow: resolveAllowReadList({ anchor: cwd, allowRead: options.allowRead }),
    deny: resolveDenyList(options.denyRead),
  };
  const writeBound: PathBound = {
    allow: resolveAllowWriteList({ anchor: cwd, allowWrite: options.allowWrite }),
    deny: resolveDenyList(options.denyWrite),
  };

  let readRootsPromise: Promise<PathBound> | undefined;
  const getReadBound = (): Promise<PathBound> => {
    readRootsPromise ??= realpathPathBound(readBound);
    return readRootsPromise;
  };
  let writeRootsPromise: Promise<PathBound> | undefined;
  const getWriteBound = (): Promise<PathBound> => {
    writeRootsPromise ??= realpathPathBound(writeBound);
    return writeRootsPromise;
  };

  async function assertReadableBound(candidate: string, requestedPath: string): Promise<void> {
    assertBound(
      candidate,
      await getReadBound(),
      requestedPath,
      "denyRead",
      `Path "${requestedPath}" is outside the allowed read roots`,
    );
  }

  async function assertWritableBound(candidate: string, requestedPath: string): Promise<void> {
    assertBound(
      candidate,
      await getWriteBound(),
      requestedPath,
      "denyWrite",
      `Path "${requestedPath}" is outside the allowed write roots`,
    );
  }

  return {
    cwd,
    async resolveForRead(requestedPath) {
      const candidate = resolveAgainstCwd(cwd, requestedPath);
      await assertReadableBound(candidate, requestedPath);
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
      await assertReadableBound(real, requestedPath);
      return real;
    },
    async resolveForWrite(requestedPath) {
      const candidate = resolveAgainstCwd(cwd, requestedPath);
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
      const joined = path.join(realParent, path.basename(candidate));
      // If the leaf already exists (including as a symlink), confine the resolved target —
      // otherwise Node's writeFile/readFile would follow an outbound leaf symlink past the
      // parent-only check above.
      try {
        const realLeaf = await realpath(joined);
        await assertWritableBound(realLeaf, requestedPath);
        return realLeaf;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          await assertWritableBound(joined, requestedPath);
          return joined;
        }
        throw error;
      }
    },
  };
}
