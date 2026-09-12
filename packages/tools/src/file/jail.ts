import { realpath } from "node:fs/promises";
import path from "node:path";

import { AdlError } from "@agent-dev-lab/core";

import { resolveAllowReadList, type ResolvedAllowRead } from "../fs-bounds.ts";
import { UNBOUNDED_ALLOW_READ } from "../unbounded-allow-read.ts";

/**
 * Read bound for the file jail and file/search factories. Omitted → `[root]`.
 * {@link UNBOUNDED_ALLOW_READ} (`"**"`) opts into host-wide reads. `null` / `[]` allow nothing.
 */
export type FileAllowRead = string[] | null | typeof UNBOUNDED_ALLOW_READ;

/**
 * Resolve `allowRead` the same way factories and the jail do: a root list, `[]` for
 * nothing, or {@link UNBOUNDED_ALLOW_READ} for host-wide. Omitted → `[root]`.
 */
export function resolveFileAllowRead(
  root: string,
  allowRead: FileAllowRead | undefined,
): ResolvedAllowRead {
  return resolveAllowReadList({
    anchor: root,
    allowRead,
  });
}

/**
 * Read-side bounds for {@link createFileJail}. Writes stay confined to `root`, and when
 * `allowWrite` is set must also land under one of those roots (`[]` → nowhere).
 *
 * `allowRead` omitted (`undefined`) defaults to `[root]` — same as `createFileTools` /
 * search. {@link UNBOUNDED_ALLOW_READ} is host-wide. `null` (or `[]`) means nothing can
 * be read. A list is exactly those roots; `root` is not inserted. `denyRead` wins over
 * any allow, including unbounded.
 */
export interface FileJailOptions {
  allowRead?: FileAllowRead;
  denyRead?: string[];
  /**
   * Extra write roots the resolved path must sit under (intersection with `root`).
   * - Omitted (`undefined`) — writes only need to stay inside `root`.
   * - `[]` — no writes allowed (fail closed; not the same as omitted).
   * - A non-empty list — write must land under one of those roots as well as `root`.
   */
  allowWrite?: string[];
}

/**
 * Confines file access to a configured root (writes) and an optional read policy. Every
 * requested path is resolved and checked (after symlink resolution) against those bounds.
 * Defends against `..` traversal and a symlink planted inside an allow root pointing outside
 * it (or into a `denyRead` path).
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
   * Resolve `requestedPath` to an absolute, symlink-resolved path for a file that must
   * already exist. Relative paths resolve against the jail root; absolute paths are accepted
   * when they fall within the read policy. Throws `AdlError("INVALID_INPUT", …)` if the path
   * escapes the read bound, is denied, or doesn't exist.
   */
  resolveExisting(requestedPath: string): Promise<string>;
  /**
   * Resolve `requestedPath` to an absolute, symlink-resolved path for a file that may not
   * exist yet. The parent directory must already exist and stay inside `root`. When the
   * leaf itself already exists, it is `realpath`'d too so an outbound leaf symlink cannot
   * smuggle a write (or an `editFile` read) outside the jail. A missing leaf stays
   * parent-only. Writes stay confined to `root` even when reads are unbounded. Throws
   * `AdlError("INVALID_INPUT", …)` if the path is absolute, escapes the root, or its
   * parent directory doesn't exist.
   */
  resolveForWrite(requestedPath: string): Promise<string>;
}

function escapesRoot(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative);
}

function rejectEscape(requestedPath: string, root: string): never {
  throw new AdlError("INVALID_INPUT", `Path "${requestedPath}" escapes the sandbox root "${root}"`);
}

function assertWithinRoot(candidate: string, realRoot: string, requestedPath: string): void {
  if (escapesRoot(candidate, realRoot)) {
    rejectEscape(requestedPath, realRoot);
  }
}

/**
 * `path.resolve(root, requestedPath)` silently discards `root` if `requestedPath` is itself
 * absolute (Node resolves right-to-left) — so an absolute write path must be rejected
 * before it ever reaches `path.resolve`, not caught after the fact. Reads accept absolute
 * paths and check them against the read policy after resolving.
 */
function resolveAgainstRoot(
  rawRoot: string,
  requestedPath: string,
  allowAbsolute: boolean,
): string {
  if (path.isAbsolute(requestedPath)) {
    if (!allowAbsolute) {
      throw new AdlError(
        "INVALID_INPUT",
        `Path must be relative to the sandbox root, got an absolute path: "${requestedPath}"`,
      );
    }
    return path.resolve(requestedPath);
  }
  return path.resolve(rawRoot, requestedPath);
}

function isWithinAny(candidate: string, roots: readonly string[]): boolean {
  return roots.some((root) => !escapesRoot(candidate, root));
}

function assertAllowedRead(
  candidate: string,
  allowRoots: ResolvedAllowRead,
  requestedPath: string,
): void {
  if (allowRoots === UNBOUNDED_ALLOW_READ || isWithinAny(candidate, allowRoots)) {
    return;
  }
  throw new AdlError("INVALID_INPUT", `Path "${requestedPath}" is outside the allowed read roots`);
}

function assertNotDenied(
  candidate: string,
  denyRoots: readonly string[],
  requestedPath: string,
): void {
  for (const denyRoot of denyRoots) {
    if (!escapesRoot(candidate, denyRoot)) {
      throw new AdlError(
        "INVALID_INPUT",
        `Path "${requestedPath}" is denied by denyRead ("${denyRoot}")`,
      );
    }
  }
}

function assertAllowedWrite(
  candidate: string,
  allowWriteRoots: readonly string[] | undefined,
  requestedPath: string,
): void {
  // Omitted → no extra bound (root already checked). Empty list → deny every write.
  if (allowWriteRoots === undefined) {
    return;
  }
  if (isWithinAny(candidate, allowWriteRoots)) {
    return;
  }
  throw new AdlError("INVALID_INPUT", `Path "${requestedPath}" is outside the allowed write roots`);
}

async function realpathOrResolve(p: string): Promise<string> {
  try {
    return await realpath(p);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return path.resolve(p);
    }
    throw error;
  }
}

export function createFileJail(root: string, options?: FileJailOptions): FileJail {
  const rawRoot = path.resolve(root);
  const denyRead = (options?.denyRead ?? []).map((p) => path.resolve(p));
  const bound = resolveFileAllowRead(rawRoot, options?.allowRead);
  const allowWriteBound =
    options?.allowWrite === undefined
      ? undefined
      : [...new Set(options.allowWrite.map((p) => path.resolve(p)))];
  // Resolved once, lazily, and cached — every call after the first reuses the same promise.
  let realRootPromise: Promise<string> | undefined;
  const getRealRoot = (): Promise<string> => {
    realRootPromise ??= realpath(rawRoot);
    return realRootPromise;
  };
  let allowRootsPromise: Promise<ResolvedAllowRead> | undefined;
  const getAllowRoots = (): Promise<ResolvedAllowRead> => {
    allowRootsPromise ??=
      bound === UNBOUNDED_ALLOW_READ
        ? Promise.resolve(UNBOUNDED_ALLOW_READ)
        : Promise.all(bound.map(realpathOrResolve));
    return allowRootsPromise;
  };
  let denyRootsPromise: Promise<string[]> | undefined;
  const getDenyRoots = (): Promise<string[]> => {
    denyRootsPromise ??= Promise.all(denyRead.map(realpathOrResolve));
    return denyRootsPromise;
  };
  let allowWriteRootsPromise: Promise<string[] | undefined> | undefined;
  const getAllowWriteRoots = (): Promise<string[] | undefined> => {
    allowWriteRootsPromise ??=
      allowWriteBound === undefined
        ? Promise.resolve(undefined)
        : Promise.all(allowWriteBound.map(realpathOrResolve));
    return allowWriteRootsPromise;
  };

  async function assertReadableBound(candidate: string, requestedPath: string): Promise<void> {
    const [allowRoots, denyRoots] = await Promise.all([getAllowRoots(), getDenyRoots()]);
    assertNotDenied(candidate, denyRoots, requestedPath);
    assertAllowedRead(candidate, allowRoots, requestedPath);
  }

  async function assertWritableBound(candidate: string, requestedPath: string): Promise<void> {
    const allowWriteRoots = await getAllowWriteRoots();
    assertAllowedWrite(candidate, allowWriteRoots, requestedPath);
  }

  return {
    root: rawRoot,
    async resolveExisting(requestedPath) {
      const candidate = resolveAgainstRoot(rawRoot, requestedPath, true);
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
      const realRoot = await getRealRoot();
      const candidate = resolveAgainstRoot(rawRoot, requestedPath, false);
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
      const joined = path.join(realParent, path.basename(candidate));
      // If the leaf already exists (including as a symlink), confine the resolved target —
      // otherwise Node's writeFile/readFile would follow an outbound leaf symlink past the
      // parent-only check above.
      try {
        const realLeaf = await realpath(joined);
        assertWithinRoot(realLeaf, realRoot, requestedPath);
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
