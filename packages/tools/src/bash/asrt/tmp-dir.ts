import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { AdlError } from "@agent-dev-lab/core";

const WORLD_OR_GROUP_WRITE = 0o022;

/**
 * A directory the current process owns and that is not group/other-writable.
 * Symlinks are rejected (`lstat`, not `stat`) so a squat under `/tmp` cannot
 * redirect us. Existing entries are never chmod'd into compliance — throw.
 */
export function assertOwnedDirectory(dir: string): void {
  const st = lstatSync(dir);
  if (st.isSymbolicLink()) {
    throw new AdlError(
      "INVALID_INPUT",
      `ASRT tmpDir "${dir}" is a symlink; refusing to follow it (ownership guard).`,
    );
  }
  if (!st.isDirectory()) {
    throw new AdlError("INVALID_INPUT", `ASRT tmpDir "${dir}" exists and is not a directory.`);
  }
  if (typeof process.getuid !== "function") {
    throw new AdlError(
      "INIT_FAILED",
      `ASRT tmpDir "${dir}": this platform has no process.getuid(); cannot verify ownership.`,
    );
  }
  if (st.uid !== process.getuid()) {
    throw new AdlError(
      "INVALID_INPUT",
      `ASRT tmpDir "${dir}" is owned by uid ${String(st.uid)}, not the current uid ` +
        `${String(process.getuid())}; refusing to adopt it.`,
    );
  }
  if ((st.mode & WORLD_OR_GROUP_WRITE) !== 0) {
    throw new AdlError(
      "INVALID_INPUT",
      `ASRT tmpDir "${dir}" is group- or world-writable (mode ` +
        `${(st.mode & 0o777).toString(8)}); refusing to adopt it.`,
    );
  }
}

export interface ResolvedAsrtTmpDir {
  path: string;
  /** `true` when this process created the directory and should remove it on dispose. */
  removeOnDispose: boolean;
}

/**
 * Resolve the directory ASRT will set as `TMPDIR` inside the sandbox
 * (`CLAUDE_CODE_TMPDIR` on the supervisor). Omitted `requested` → a fresh
 * `mkdtemp` under `os.tmpdir()`. An existing path must already pass
 * {@link assertOwnedDirectory}; a missing path is created `0o700` then checked.
 */
export function resolveAsrtTmpDir(requested?: string): ResolvedAsrtTmpDir {
  if (requested === undefined) {
    const dir = mkdtempSync(path.join(tmpdir(), "adl-asrt-tmp-"));
    chmodSync(dir, 0o700);
    assertOwnedDirectory(dir);
    return { path: dir, removeOnDispose: true };
  }
  const dir = path.resolve(requested);
  const existed = existsSync(dir);
  if (!existed) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    chmodSync(dir, 0o700);
  }
  assertOwnedDirectory(dir);
  return { path: dir, removeOnDispose: !existed };
}

/** Recreate `dir` if it vanished after dispose (same path, so ASRT allowWrite stays valid). */
export function ensureAsrtTmpDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    chmodSync(dir, 0o700);
  }
  assertOwnedDirectory(dir);
}
