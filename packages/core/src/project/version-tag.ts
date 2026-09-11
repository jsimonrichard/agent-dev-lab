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
 * Runs a VCS command in `cwd`, returning trimmed stdout, or undefined for any
 * failure — including the binary not being installed.
 *
 * The timeout guards against a genuinely hung process, so it is deliberately
 * far longer than the command should ever take: a busy machine (a full test
 * suite running every package at once, say) is normal, and a timeout here
 * silently changes what provenance gets recorded, which is the failure mode
 * worth avoiding.
 */
function vcs(binary: string, cwd: string, args: string[]): string | undefined {
  try {
    return execFileSync(binary, args, {
      cwd,
      encoding: "utf8",
      timeout: 30_000,
      // The tool's own stderr is not this process's problem; a failure is
      // reported by the absence of a tag, not by noise on the console.
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return undefined;
  }
}

/**
 * `--ignore-working-copy` on every call is load-bearing, not a detail.
 *
 * jj snapshots the working copy on an ordinary command, which writes a new
 * operation to the repo. Recording provenance must not mutate the repo it is
 * describing — and in a multi-workspace checkout it is worse than untidy: a
 * snapshot from one workspace is exactly what leaves another's working copy
 * stale. Verified: three reads with this flag add zero operations, while one
 * ordinary `jj log` against a dirty tree adds one.
 *
 * The cost is that the id can be stale with respect to files edited since jj
 * last snapshotted. That window is unavoidable without mutating, and is
 * documented on {@link resolveProjectVersionTag} rather than papered over.
 */
function jj(cwd: string, args: string[]): string | undefined {
  return vcs("jj", cwd, ["--ignore-working-copy", ...args]);
}

function git(cwd: string, args: string[]): string | undefined {
  return vcs("git", cwd, args);
}

/**
 * jj's identifier for the code in the working copy.
 *
 * jj's working copy *is* a commit, so unlike git there is no
 * tracked-but-uncommitted gap: `@`'s commit id already accounts for edits jj
 * has snapshotted. `+dirty` therefore means the same thing it does for git —
 * this tree carries work beyond its parent commit — rather than marking the
 * id as untrustworthy.
 */
function resolveJjTag(projectRoot: string): string | undefined {
  if (jj(projectRoot, ["root"]) === undefined) {
    return undefined;
  }
  const commitId = jj(projectRoot, ["log", "-r", "@", "--no-graph", "-T", "commit_id"]);
  if (!commitId) {
    return undefined;
  }
  const emptiness = jj(projectRoot, [
    "log",
    "-r",
    "@",
    "--no-graph",
    "-T",
    'if(empty,"empty","nonempty")',
  ]);
  // Unknown emptiness counts as dirty, the same direction git's takes: it is
  // the reading that does not over-claim.
  const clean = emptiness === "empty";
  return `${COMMIT_TAG_PREFIX}${commitId}${clean ? "" : DIRTY_TAG_SUFFIX}`;
}

function resolveGitTag(projectRoot: string): string | undefined {
  const sha = git(projectRoot, ["rev-parse", "HEAD"]);
  if (!sha) {
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

function resolveUncached(projectRoot: string, version: string | undefined): string | undefined {
  // An explicit version wins: it is stated intent (a release identifier, say),
  // and it is the answer for a project that has no VCS at all.
  if (version) {
    return `${VERSION_TAG_PREFIX}${version}`;
  }

  // jj before git, matching this repo's own convention: `.claude/gate.sh`
  // resolves jj first "when both are present, matching vcs_kind_at() in
  // tsk-core". A colocated repo would answer to either, and jj is the one the
  // user drives.
  //
  // No tag at all when neither answers: absent provenance is honest, where
  // inventing it would not be.
  return resolveJjTag(projectRoot) ?? resolveGitTag(projectRoot);
}

/**
 * The tag identifying which version of the project's code a run came from, in
 * precedence order:
 *
 * 1. `version:<configured>` — {@link AdlRuntimeConfig.version}. Stated intent
 *    wins, and it is the only answer for a project with no VCS.
 * 2. `commit:<jj @ commit id>` — jj first, matching this repo's own
 *    convention (`.claude/gate.sh` resolves jj ahead of git "when both are
 *    present"). A colocated repo would answer to either.
 * 3. `commit:<git HEAD sha>`.
 * 4. Nothing. An absent tag is honest where inventing provenance is not.
 *
 * `+dirty` is appended when the tree carries work beyond its parent commit,
 * and on either VCS an *unknown* answer counts as dirty rather than clean —
 * that is the reading that does not over-claim.
 *
 * **Known limitation, jj only.** Reads pass `--ignore-working-copy`, so
 * recording provenance never writes a jj operation. The tradeoff is that the
 * id reflects jj's last snapshot, so edits made since then are not included.
 * Closing that window would mean snapshotting on every process start, which
 * mutates the repo being described and, in a multi-workspace checkout, can
 * leave a sibling workspace stale.
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
