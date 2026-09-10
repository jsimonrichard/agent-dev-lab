import { execFileSync } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { beforeEach, describe, expect, it } from "bun:test";

import { clearProjectVersionTagCache, resolveProjectVersionTag } from "./version-tag";

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
