import { execFileSync } from "node:child_process";

import { resolveProjectRoot } from "./resolve";

/** Prefix for an explicitly configured version string. */
export const VERSION_TAG_PREFIX = "version:";
/** Prefix for a resolved VCS commit. */
export const COMMIT_TAG_PREFIX = "commit:";
/** Appended to a commit tag when the working tree has uncommitted changes. */
export const DIRTY_TAG_SUFFIX = "+dirty";

/**
 * Resolved once per project root per process, not per run.
 *
 * Two `git` subprocesses on every `workflow.run()` would be a real cost on a
 * batch, and within one process the loaded project code is fixed — this
 * identifies "the code this process is running". A commit made while a long
 * lived server is up will not be picked up until it reloads.
 */
const cache = new Map<string, string | undefined>();

/**
 * Runs git in `cwd`, returning trimmed stdout, or undefined for any failure.
 *
 * The timeout guards against a genuinely hung git, so it is deliberately far
 * longer than the command should ever take: a busy machine (a full test suite
 * running every package at once, say) is normal, and a timeout here silently
 * changes what provenance gets recorded, which is the failure mode worth
 * avoiding.
 */
function git(cwd: string, args: string[]): string | undefined {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      timeout: 30_000,
      // git's own stderr is not this process's problem; a failure is reported
      // by the absence of a tag, not by noise on the console.
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return undefined;
  }
}

function resolveUncached(projectRoot: string, version: string | undefined): string | undefined {
  // An explicit version wins: it is stated intent (a release identifier, say),
  // and it is the answer for a project that has no VCS at all.
  if (version) {
    return `${VERSION_TAG_PREFIX}${version}`;
  }

  const sha = git(projectRoot, ["rev-parse", "HEAD"]);
  if (!sha) {
    // No git, no configured version: no tag. An absent tag is honest, where
    // inventing provenance would not be. Note this covers a jj repo that is
    // not colocated with git — including this framework's own checkout.
    return undefined;
  }

  // A bare SHA would claim the run came from that commit's code, which is
  // false the moment anything is uncommitted — hence the explicit marker
  // rather than either silently lying or refusing to tag.
  //
  // A failed status check counts as dirty on purpose: unknown cleanliness must
  // not be recorded as clean, since that is the direction that over-claims.
  const status = git(projectRoot, ["status", "--porcelain"]);
  const clean = status !== undefined && status.length === 0;
  return `${COMMIT_TAG_PREFIX}${sha}${clean ? "" : DIRTY_TAG_SUFFIX}`;
}

/**
 * The tag identifying which version of the project's code a run came from:
 * `version:<configured>` when set, else `commit:<sha>` (plus `+dirty` when the
 * tree has uncommitted changes), else nothing.
 *
 * Applied automatically to `workflow.run()` — see {@link WorkflowRunStartOptions.tags},
 * whose docs already anticipated "a project's git commit" as a tag.
 */
export function resolveProjectVersionTag(options?: {
  projectRoot?: string;
  version?: string;
}): string | undefined {
  const projectRoot = options?.projectRoot ?? resolveProjectRoot();
  // JSON rather than a delimiter, so no separator can collide with a path
  // or a version string.
  const key = JSON.stringify([projectRoot, options?.version ?? ""]);
  if (cache.has(key)) {
    return cache.get(key);
  }
  const resolved = resolveUncached(projectRoot, options?.version);
  cache.set(key, resolved);
  return resolved;
}

/** Test seam: drops the per-process resolution cache. */
export function clearProjectVersionTagCache(): void {
  cache.clear();
}
