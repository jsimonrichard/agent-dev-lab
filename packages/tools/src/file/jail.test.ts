import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { isAdlError } from "@agent-dev-lab/core";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import { UNBOUNDED_ALLOW_READ } from "../unbounded-allow-read.ts";
import { createFileJail } from "./jail";

let root: string;
let outsideDir: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "adl-file-jail-root-"));
  outsideDir = await mkdtemp(path.join(tmpdir(), "adl-file-jail-outside-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
  await rm(outsideDir, { recursive: true, force: true });
});

/** Asserts `promise` rejects with an `AdlError("INVALID_INPUT", …)`, ADL's convention for a
 * rejected-tool-input error (see `packages/core/src/agent/agent-impl.test.ts`). */
async function expectInvalidInput(promise: Promise<unknown>): Promise<void> {
  try {
    await promise;
  } catch (error) {
    expect(isAdlError(error)).toBe(true);
    expect(isAdlError(error) && error.code).toBe("INVALID_INPUT");
    return;
  }
  throw new Error("Expected the promise to reject, but it resolved.");
}

describe("createFileJail", () => {
  describe("resolveExisting", () => {
    it("resolves a plain relative path inside the root", async () => {
      await writeFile(path.join(root, "a.txt"), "hi", "utf8");
      const jail = createFileJail(root);
      const resolved = await jail.resolveExisting("a.txt");
      expect(resolved).toBe(await realpath(path.join(root, "a.txt")));
    });

    it("resolves a nested relative path", async () => {
      await mkdir(path.join(root, "sub"), { recursive: true });
      await writeFile(path.join(root, "sub", "b.txt"), "hi", "utf8");
      const jail = createFileJail(root);
      const resolved = await jail.resolveExisting("sub/b.txt");
      expect(resolved).toBe(await realpath(path.join(root, "sub", "b.txt")));
    });

    it("rejects a path that doesn't exist", async () => {
      const jail = createFileJail(root);
      await expectInvalidInput(jail.resolveExisting("missing.txt"));
    });

    it("rejects an absolute path outside the root when allowRead is the write root", async () => {
      const jail = createFileJail(root, { allowRead: [root] });
      const outsideFile = path.join(outsideDir, "secret.txt");
      await writeFile(outsideFile, "secret", "utf8");
      await expectInvalidInput(jail.resolveExisting(outsideFile));
    });

    it("accepts an absolute path that stays inside the root", async () => {
      await writeFile(path.join(root, "a.txt"), "hi", "utf8");
      const jail = createFileJail(root);
      const resolved = await jail.resolveExisting(path.join(root, "a.txt"));
      expect(resolved).toBe(await realpath(path.join(root, "a.txt")));
    });

    it("rejects an absolute path outside the root when allowRead is omitted (defaults to root)", async () => {
      const outsideFile = path.join(outsideDir, "secret.txt");
      await writeFile(outsideFile, "secret", "utf8");
      const jail = createFileJail(root);
      await expectInvalidInput(jail.resolveExisting(outsideFile));
    });

    it("reads an absolute path outside the root when allowRead is UNBOUNDED_ALLOW_READ", async () => {
      const outsideFile = path.join(outsideDir, "secret.txt");
      await writeFile(outsideFile, "secret", "utf8");
      const jail = createFileJail(root, { allowRead: UNBOUNDED_ALLOW_READ });
      const resolved = await jail.resolveExisting(outsideFile);
      expect(resolved).toBe(await realpath(outsideFile));
    });

    it("reads a path under an allowRead root without implying the write root is readable", async () => {
      await writeFile(path.join(root, "inside.txt"), "inside", "utf8");
      const outsideFile = path.join(outsideDir, "extra.txt");
      await writeFile(outsideFile, "extra", "utf8");
      const jail = createFileJail(root, { allowRead: [outsideDir] });
      const resolved = await jail.resolveExisting(outsideFile);
      expect(resolved).toBe(await realpath(outsideFile));
      await expectInvalidInput(jail.resolveExisting("inside.txt"));
    });

    it("rejects every path when allowRead is null", async () => {
      await writeFile(path.join(root, "a.txt"), "hi", "utf8");
      const jail = createFileJail(root, { allowRead: null });
      await expectInvalidInput(jail.resolveExisting("a.txt"));
      await expectInvalidInput(jail.resolveExisting(path.join(root, "a.txt")));
    });

    it("rejects a denyRead path even when it sits inside the root", async () => {
      await mkdir(path.join(root, "hidden"), { recursive: true });
      await writeFile(path.join(root, "hidden", "secret.txt"), "nope", "utf8");
      const jail = createFileJail(root, { denyRead: [path.join(root, "hidden")] });
      await expectInvalidInput(jail.resolveExisting("hidden/secret.txt"));
    });

    it("rejects a denyRead path even when allowRead is UNBOUNDED_ALLOW_READ", async () => {
      const outsideFile = path.join(outsideDir, "secret.txt");
      await writeFile(outsideFile, "secret", "utf8");
      const jail = createFileJail(root, {
        allowRead: UNBOUNDED_ALLOW_READ,
        denyRead: [outsideDir],
      });
      await expectInvalidInput(jail.resolveExisting(outsideFile));
    });

    it("rejects a `..` traversal that escapes the root when allowRead is the write root", async () => {
      const outsideFile = path.join(outsideDir, "secret.txt");
      await writeFile(outsideFile, "secret", "utf8");
      const jail = createFileJail(root, { allowRead: [root] });
      const relativeEscape = path.join("..", path.basename(outsideDir), "secret.txt");
      await expectInvalidInput(jail.resolveExisting(relativeEscape));
    });

    it("rejects a symlink inside the root that points outside it when allowRead is the write root", async () => {
      const outsideFile = path.join(outsideDir, "secret.txt");
      await writeFile(outsideFile, "secret", "utf8");
      await symlink(outsideFile, path.join(root, "link.txt"));
      const jail = createFileJail(root, { allowRead: [root] });
      await expectInvalidInput(jail.resolveExisting("link.txt"));
    });

    it("rejects a path reached through a symlinked *ancestor* directory, not just the immediate parent", async () => {
      // realpath() must resolve every path component, not only the leaf's own parent — this
      // exercises that: `link` is two levels above the requested file, with a real
      // subdirectory (`deep`) in between.
      await mkdir(path.join(outsideDir, "deep"), { recursive: true });
      const outsideFile = path.join(outsideDir, "deep", "secret.txt");
      await writeFile(outsideFile, "secret", "utf8");
      await symlink(outsideDir, path.join(root, "link"));
      const jail = createFileJail(root, { allowRead: [root] });
      await expectInvalidInput(jail.resolveExisting("link/deep/secret.txt"));
    });

    it("resolves a `..` that stays inside the root", async () => {
      await mkdir(path.join(root, "sub"), { recursive: true });
      await writeFile(path.join(root, "a.txt"), "hi", "utf8");
      const jail = createFileJail(root);
      const resolved = await jail.resolveExisting("sub/../a.txt");
      expect(resolved).toBe(await realpath(path.join(root, "a.txt")));
    });
  });

  describe("resolveForWrite", () => {
    it("resolves a new file's path when the parent directory exists", async () => {
      const jail = createFileJail(root);
      const resolved = await jail.resolveForWrite("new.txt");
      expect(resolved).toBe(path.join(await realpath(root), "new.txt"));
    });

    it("resolves a new file in a nested existing directory", async () => {
      await mkdir(path.join(root, "sub"), { recursive: true });
      const jail = createFileJail(root);
      const resolved = await jail.resolveForWrite("sub/new.txt");
      expect(resolved).toBe(path.join(await realpath(path.join(root, "sub")), "new.txt"));
    });

    it("rejects when the parent directory doesn't exist", async () => {
      const jail = createFileJail(root);
      await expectInvalidInput(jail.resolveForWrite("missing-dir/new.txt"));
    });

    it("rejects an absolute path", async () => {
      const jail = createFileJail(root);
      await expectInvalidInput(jail.resolveForWrite(path.join(outsideDir, "new.txt")));
    });

    it("rejects a `..` traversal that escapes the root", async () => {
      const jail = createFileJail(root);
      const relativeEscape = path.join("..", path.basename(outsideDir), "new.txt");
      await expectInvalidInput(jail.resolveForWrite(relativeEscape));
    });

    it("rejects a symlinked parent directory that points outside the root", async () => {
      await symlink(outsideDir, path.join(root, "linked-dir"));
      const jail = createFileJail(root);
      await expectInvalidInput(jail.resolveForWrite("linked-dir/new.txt"));
    });

    it("rejects a new file whose parent is reached through a symlinked *ancestor*, not just the immediate parent", async () => {
      // Mirrors the resolveExisting case above, but for a not-yet-existing file: `link` is
      // two levels above the new file, with a real subdirectory (`deep`) — which does
      // exist — in between.
      await mkdir(path.join(outsideDir, "deep"), { recursive: true });
      await symlink(outsideDir, path.join(root, "link"));
      const jail = createFileJail(root);
      await expectInvalidInput(jail.resolveForWrite("link/deep/new.txt"));
    });

    it("rejects an existing leaf symlink that points outside the root", async () => {
      const outsideFile = path.join(outsideDir, "secret.txt");
      await writeFile(outsideFile, "secret", "utf8");
      await symlink(outsideFile, path.join(root, "link.txt"));
      const jail = createFileJail(root);
      await expectInvalidInput(jail.resolveForWrite("link.txt"));
    });

    it("allows writing through an inbound leaf symlink that stays inside the root", async () => {
      await writeFile(path.join(root, "target.txt"), "orig", "utf8");
      await symlink(path.join(root, "target.txt"), path.join(root, "link.txt"));
      const jail = createFileJail(root);
      const resolved = await jail.resolveForWrite("link.txt");
      expect(resolved).toBe(await realpath(path.join(root, "target.txt")));
    });

    it("rejects a write outside allowWrite even when the path stays under root", async () => {
      const jail = createFileJail(root, { allowWrite: [path.join(root, "only-here")] });
      await mkdir(path.join(root, "only-here"), { recursive: true });
      await expectInvalidInput(jail.resolveForWrite("outside-allow.txt"));
    });

    it("rejects every write when allowWrite is an empty list", async () => {
      const jail = createFileJail(root, { allowWrite: [] });
      await expectInvalidInput(jail.resolveForWrite("anywhere.txt"));
    });

    it("allows a write under both root and allowWrite", async () => {
      await mkdir(path.join(root, "only-here"), { recursive: true });
      const jail = createFileJail(root, { allowWrite: [path.join(root, "only-here")] });
      const resolved = await jail.resolveForWrite("only-here/ok.txt");
      expect(resolved).toBe(path.join(await realpath(path.join(root, "only-here")), "ok.txt"));
    });
  });
});
