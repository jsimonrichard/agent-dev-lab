import { existsSync, lstatSync, readdirSync, readlinkSync } from "node:fs";

/**
 * System paths that stay readable whenever an executor bounds reads to a set of roots —
 * without a dynamic loader, shared libraries and binaries, nothing can run at all.
 *
 * This is why {@link BashExecutorDescription.allowRead} promises "no *user* data outside
 * these roots" rather than "only these roots": `/etc/passwd` remains readable either way.
 *
 * Listed as plain paths (including usr-merge spellings like `/bin`) and resolved at runtime
 * so the same list works on a usr-merged distribution and on one where these are real
 * directories. Symlink entries are not passed to bwrap as `--ro-bind` destinations after a
 * host `/` bind — see {@link existingSystemReadPaths} / {@link systemReadBwrapArgs}.
 */
export const SYSTEM_READ_PATHS = [
  "/usr",
  "/etc",
  "/bin",
  "/sbin",
  "/lib",
  "/lib64",
  "/opt",
  // systemd-resolved (and similar) make `/etc/resolv.conf` a symlink into `/run`; without
  // this bind, a read-bounded sandbox cannot resolve DNS even with network enabled.
  "/run",
];

/** Root mount names ASRT already remounts itself after filesystem args (never deny-tmpfs). */
const ROOT_DENY_SKIP = new Set(["proc", "dev", "sys"]);

function isPresentSymlink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

function isPresentDirectory(path: string): boolean {
  try {
    const st = lstatSync(path);
    return st.isDirectory() && !st.isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * {@link SYSTEM_READ_PATHS} that are real directories on this host.
 *
 * Usr-merge symlinks (`/bin` → `usr/bin`) are omitted: after ASRT's `--ro-bind / /`,
 * `--ro-bind /bin /bin` / `--tmpfs /bin` fail with `Can't mount on symlink destination`.
 * The real directory (`/usr`) stays on the list and covers their contents; the host
 * symlink from the root bind keeps `/bin/bash` resolving.
 */
export function existingSystemReadPaths(): string[] {
  return SYSTEM_READ_PATHS.filter(isPresentDirectory);
}

/**
 * Expand a host-wide read deny into `/`'s children **without** usr-merge symlink mounts.
 *
 * ASRT encodes `denyRead: ["/"]` by tmpfs'ing each root child. On Arch/etc. `/bin` is a
 * symlink, and `bwrap --tmpfs /bin` (after `--ro-bind / /`) aborts with
 * `Can't mount on symlink destination /bin`. Passing the expanded real-directory list
 * instead leaves those symlinks in place from the root bind so `/bin/bash` still works
 * once `/usr` is re-allowed.
 */
export function expandedRootDenyReadPaths(): string[] {
  if (!existsSync("/")) {
    return [];
  }
  const out: string[] = [];
  for (const name of readdirSync("/")) {
    if (ROOT_DENY_SKIP.has(name)) {
      continue;
    }
    const p = `/${name}`;
    if (isPresentDirectory(p)) {
      out.push(p);
    }
  }
  return out;
}

/**
 * Bubblewrap argv for system reads when the mount namespace starts empty (native executor).
 *
 * Real directories → `--ro-bind`. Usr-merge symlinks → `--symlink` with the link text (e.g.
 * `usr/bin`), so `/bin/bash` exists without mounting onto a symlink destination.
 */
export function systemReadBwrapArgs(): string[] {
  const args: string[] = [];
  for (const p of SYSTEM_READ_PATHS) {
    if (!existsSync(p)) {
      continue;
    }
    if (isPresentSymlink(p)) {
      args.push("--symlink", readlinkSync(p), p);
      continue;
    }
    if (isPresentDirectory(p)) {
      args.push("--ro-bind", p, p);
    }
  }
  return args;
}
