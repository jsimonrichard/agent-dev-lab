import { existsSync } from "node:fs";

/**
 * System paths that stay readable whenever an executor bounds reads to a set of roots —
 * without a dynamic loader, shared libraries and binaries, nothing runs at all.
 *
 * This is why {@link BashExecutorDescription.allowRead} promises "no *user* data outside
 * these roots" rather than "only these roots": `/etc/passwd` remains readable either way.
 *
 * Listed as plain paths and filtered by existence so the same list works on a usr-merged
 * distribution (where `/bin` is a symlink to `usr/bin`) and on one where these are real
 * directories.
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

/** {@link SYSTEM_READ_PATHS} filtered to those actually present on this host. */
export function existingSystemReadPaths(): string[] {
  return SYSTEM_READ_PATHS.filter((p) => existsSync(p));
}
