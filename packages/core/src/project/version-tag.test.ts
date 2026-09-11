import { execFileSync } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { beforeEach, describe, expect, it } from "bun:test";

import {
  clearProjectVersionTagCache,
  resolveProjectVersionTag,
  withProjectVersionTag,
} from "./version-tag";

async function tempDir(prefix: string): Promise<string> {
  return mkdtemp(path.join(tmpdir(), prefix));
}

function run(cwd: string, args: string[]): void {
  execFileSync("git", args, { cwd, stdio: ["ignore", "ignore", "ignore"] });
}

/** A real git repo with one commit, so the resolver is exercised, not mocked. */
async function gitRepoWithCommit(): Promise<{ root: string; sha: string }> {
  const root = await tempDir("adl-version-git-");
  run(root, ["init", "--quiet"]);
  run(root, ["config", "user.email", "test@example.com"]);
  run(root, ["config", "user.name", "Test"]);
  run(root, ["config", "commit.gpgsign", "false"]);
  await writeFile(path.join(root, "tracked.txt"), "one\n");
  run(root, ["add", "."]);
  run(root, ["commit", "--quiet", "-m", "first"]);
  const sha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  return { root, sha };
}

/** A real jj repo with one described change and an empty working copy on top. */
async function jjRepoWithCommit(): Promise<{ root: string; commitId: string }> {
  const root = await tempDir("adl-version-jj-");
  execFileSync("jj", ["git", "init", "--quiet", "."], {
    cwd: root,
    stdio: ["ignore", "ignore", "ignore"],
  });
  await writeFile(path.join(root, "tracked.txt"), "one\n");
  execFileSync("jj", ["describe", "-m", "base"], {
    cwd: root,
    stdio: ["ignore", "ignore", "ignore"],
  });
  // `jj new` leaves @ empty, the jj analogue of a clean git tree.
  execFileSync("jj", ["new"], { cwd: root, stdio: ["ignore", "ignore", "ignore"] });
  const commitId = execFileSync(
    "jj",
    ["--ignore-working-copy", "log", "-r", "@", "--no-graph", "-T", "commit_id"],
    { cwd: root, encoding: "utf8" },
  ).trim();
  return { root, commitId };
}

function jjOperationCount(root: string): number {
  return execFileSync(
    "jj",
    ["--ignore-working-copy", "op", "log", "--no-graph", "-T", 'id.short() ++ "\\n"'],
    { cwd: root, encoding: "utf8" },
  )
    .trim()
    .split("\n")
    .filter((line) => line.length > 0).length;
}

describe("resolveProjectVersionTag (jj)", () => {
  beforeEach(() => {
    clearProjectVersionTagCache();
  });

  it("resolves an empty jj working copy to its commit id", async () => {
    const { root, commitId } = await jjRepoWithCommit();
    expect(resolveProjectVersionTag({ projectRoot: root })).toBe(`commit:${commitId}`);
  });

  it("marks a working copy that carries changes", async () => {
    const { root } = await jjRepoWithCommit();
    await writeFile(path.join(root, "tracked.txt"), "changed\n");
    // Snapshot the edit into @ so it is recorded, the way any jj command would.
    execFileSync("jj", ["status"], { cwd: root, stdio: ["ignore", "ignore", "ignore"] });
    clearProjectVersionTagCache();

    const tag = resolveProjectVersionTag({ projectRoot: root });
    expect(tag).toMatch(/^commit:[0-9a-f]{40}\+dirty$/);
  });

  it("does not write a jj operation while resolving", async () => {
    const { root } = await jjRepoWithCommit();
    // An edit jj has not snapshotted: an ordinary `jj log` here would snapshot
    // it and add an operation. Recording provenance must not mutate the repo
    // it describes — in a multi-workspace checkout that is what leaves a
    // sibling workspace stale.
    await writeFile(path.join(root, "tracked.txt"), "unsnapshotted\n");
    const before = jjOperationCount(root);

    resolveProjectVersionTag({ projectRoot: root });
    clearProjectVersionTagCache();
    resolveProjectVersionTag({ projectRoot: root });

    expect(jjOperationCount(root)).toBe(before);
  });

  it("prefers jj over git in a colocated repo", async () => {
    // `jj git init` makes a colocated repo: both VCSs can answer. gate.sh
    // resolves jj first when both are present, and this follows it.
    const { root, commitId } = await jjRepoWithCommit();
    expect(path.join(root, ".git")).toBeTruthy();
    const tag = resolveProjectVersionTag({ projectRoot: root });
    expect(tag).toBe(`commit:${commitId}`);
    // Sanity: git alone would have answered with a different id (@ is an
    // empty change on top, which git's HEAD does not know about).
    const gitHead = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    }).trim();
    expect(tag).not.toBe(`commit:${gitHead}`);
  });

  it("still lets an explicit version win over jj", async () => {
    const { root } = await jjRepoWithCommit();
    expect(resolveProjectVersionTag({ projectRoot: root, version: "2.0.0" })).toBe("version:2.0.0");
  });
});

describe("resolveProjectVersionTag", () => {
  beforeEach(() => {
    clearProjectVersionTagCache();
  });

  it("prefers an explicitly configured version over git", async () => {
    const { root } = await gitRepoWithCommit();
    expect(resolveProjectVersionTag({ projectRoot: root, version: "1.4.0" })).toBe("version:1.4.0");
  });

  it("resolves a clean git tree to its commit sha", async () => {
    const { root, sha } = await gitRepoWithCommit();
    expect(resolveProjectVersionTag({ projectRoot: root })).toBe(`commit:${sha}`);
  });

  it("marks a dirty tree rather than claiming the bare sha", async () => {
    const { root, sha } = await gitRepoWithCommit();
    await writeFile(path.join(root, "tracked.txt"), "changed\n");
    // A bare commit: tag would assert the run came from that commit's code,
    // which stopped being true the moment anything was uncommitted.
    expect(resolveProjectVersionTag({ projectRoot: root })).toBe(`commit:${sha}+dirty`);
  });

  it("counts an untracked file as dirty", async () => {
    const { root, sha } = await gitRepoWithCommit();
    await writeFile(path.join(root, "untracked.txt"), "new\n");
    expect(resolveProjectVersionTag({ projectRoot: root })).toBe(`commit:${sha}+dirty`);
  });

  it("returns no tag for a directory with no git repository", async () => {
    const root = await tempDir("adl-version-nogit-");
    // Absent is honest; inventing provenance would not be. This is also the
    // case for a jj repo that is not colocated with git.
    expect(resolveProjectVersionTag({ projectRoot: root })).toBeUndefined();
  });

  it("still yields a version tag with no git repository when one is configured", async () => {
    const root = await tempDir("adl-version-nogit-");
    expect(resolveProjectVersionTag({ projectRoot: root, version: "0.0.3" })).toBe("version:0.0.3");
  });

  it("caches per project root and configured version", async () => {
    const { root, sha } = await gitRepoWithCommit();
    expect(resolveProjectVersionTag({ projectRoot: root })).toBe(`commit:${sha}`);
    // Dirtying the tree does not change the answer within a process...
    await writeFile(path.join(root, "tracked.txt"), "changed\n");
    expect(resolveProjectVersionTag({ projectRoot: root })).toBe(`commit:${sha}`);
    // ...until the cache is dropped.
    clearProjectVersionTagCache();
    expect(resolveProjectVersionTag({ projectRoot: root })).toBe(`commit:${sha}+dirty`);
    // A different configured version is a different cache key.
    expect(resolveProjectVersionTag({ projectRoot: root, version: "9.9.9" })).toBe("version:9.9.9");
  });
});

describe("withProjectVersionTag", () => {
  beforeEach(() => {
    clearProjectVersionTagCache();
  });

  it("skips the VCS lookup when version tagging is disabled", () => {
    expect(withProjectVersionTag(["dataset:qa-v1"], false)).toEqual(["dataset:qa-v1"]);
    expect(withProjectVersionTag(undefined, false)).toBeUndefined();
  });

  it("adds the configured version tag when the caller supplied none", () => {
    expect(withProjectVersionTag(undefined, "1.4.0")).toEqual(["version:1.4.0"]);
    expect(withProjectVersionTag([], "1.4.0")).toEqual(["version:1.4.0"]);
  });

  it("keeps caller tags alongside the automatic version tag", () => {
    expect(withProjectVersionTag(["dataset:qa-v1"], "1.4.0")).toEqual([
      "dataset:qa-v1",
      "version:1.4.0",
    ]);
  });

  it("lets a caller tag with the same prefix win", () => {
    expect(withProjectVersionTag(["version:override"], "1.4.0")).toEqual(["version:override"]);
  });
});
