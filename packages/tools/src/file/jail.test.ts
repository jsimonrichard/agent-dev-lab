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

function jail(options: Parameters<typeof createFileJail>[0] = {}) {
  return createFileJail({ cwd: root, ...options });
}

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
  describe("resolveForRead", () => {
    it("resolves a plain relative path inside the cwd", async () => {
      await writeFile(path.join(root, "a.txt"), "hi", "utf8");
      const resolved = await jail().resolveForRead("a.txt");
      expect(resolved).toBe(await realpath(path.join(root, "a.txt")));
    });

    it("resolves a nested relative path", async () => {
      await mkdir(path.join(root, "sub"), { recursive: true });
      await writeFile(path.join(root, "sub", "b.txt"), "hi", "utf8");
      const resolved = await jail().resolveForRead("sub/b.txt");
      expect(resolved).toBe(await realpath(path.join(root, "sub", "b.txt")));
    });

    it("rejects a path that doesn't exist", async () => {
      await expectInvalidInput(jail().resolveForRead("missing.txt"));
    });

    it("rejects an absolute path outside allowRead", async () => {
      const outsideFile = path.join(outsideDir, "secret.txt");
      await writeFile(outsideFile, "secret", "utf8");
      await expectInvalidInput(jail({ allowRead: [root] }).resolveForRead(outsideFile));
    });

    it("accepts an absolute path that stays inside allowRead", async () => {
      await writeFile(path.join(root, "a.txt"), "hi", "utf8");
      const resolved = await jail().resolveForRead(path.join(root, "a.txt"));
      expect(resolved).toBe(await realpath(path.join(root, "a.txt")));
    });

    it("rejects an absolute path outside allowRead when allowRead is omitted (defaults to cwd)", async () => {
      const outsideFile = path.join(outsideDir, "secret.txt");
      await writeFile(outsideFile, "secret", "utf8");
      await expectInvalidInput(jail().resolveForRead(outsideFile));
    });

    it("reads an absolute path outside cwd when allowRead is UNBOUNDED_ALLOW_READ", async () => {
      const outsideFile = path.join(outsideDir, "secret.txt");
      await writeFile(outsideFile, "secret", "utf8");
      const resolved = await jail({ allowRead: UNBOUNDED_ALLOW_READ }).resolveForRead(outsideFile);
      expect(resolved).toBe(await realpath(outsideFile));
    });

    it("reads a path under an allowRead root without implying cwd is readable", async () => {
      await writeFile(path.join(root, "inside.txt"), "inside", "utf8");
      const outsideFile = path.join(outsideDir, "extra.txt");
      await writeFile(outsideFile, "extra", "utf8");
      const j = jail({ allowRead: [outsideDir] });
      const resolved = await j.resolveForRead(outsideFile);
      expect(resolved).toBe(await realpath(outsideFile));
      await expectInvalidInput(j.resolveForRead("inside.txt"));
    });

    it("rejects every path when allowRead is null", async () => {
      await writeFile(path.join(root, "a.txt"), "hi", "utf8");
      const j = jail({ allowRead: null });
      await expectInvalidInput(j.resolveForRead("a.txt"));
      await expectInvalidInput(j.resolveForRead(path.join(root, "a.txt")));
    });

    it("rejects a denyRead path even when it sits inside allowRead", async () => {
      await mkdir(path.join(root, "hidden"), { recursive: true });
      await writeFile(path.join(root, "hidden", "secret.txt"), "nope", "utf8");
      await expectInvalidInput(
        jail({ denyRead: [path.join(root, "hidden")] }).resolveForRead("hidden/secret.txt"),
      );
    });

    it("rejects a denyRead path even when allowRead is UNBOUNDED_ALLOW_READ", async () => {
      const outsideFile = path.join(outsideDir, "secret.txt");
      await writeFile(outsideFile, "secret", "utf8");
      await expectInvalidInput(
        jail({
          allowRead: UNBOUNDED_ALLOW_READ,
          denyRead: [outsideDir],
        }).resolveForRead(outsideFile),
      );
    });

    it("rejects a `..` traversal that escapes allowRead", async () => {
      const outsideFile = path.join(outsideDir, "secret.txt");
      await writeFile(outsideFile, "secret", "utf8");
      const relativeEscape = path.join("..", path.basename(outsideDir), "secret.txt");
      await expectInvalidInput(jail({ allowRead: [root] }).resolveForRead(relativeEscape));
    });

    it("rejects a symlink inside allowRead that points outside it", async () => {
      const outsideFile = path.join(outsideDir, "secret.txt");
      await writeFile(outsideFile, "secret", "utf8");
      await symlink(outsideFile, path.join(root, "link.txt"));
      await expectInvalidInput(jail({ allowRead: [root] }).resolveForRead("link.txt"));
    });

    it("rejects a path reached through a symlinked *ancestor* directory, not just the immediate parent", async () => {
      // realpath() must resolve every path component, not only the leaf's own parent — this
      // exercises that: `link` is two levels above the requested file, with a real
      // subdirectory (`deep`) in between.
      await mkdir(path.join(outsideDir, "deep"), { recursive: true });
      const outsideFile = path.join(outsideDir, "deep", "secret.txt");
      await writeFile(outsideFile, "secret", "utf8");
      await symlink(outsideDir, path.join(root, "link"));
      await expectInvalidInput(jail({ allowRead: [root] }).resolveForRead("link/deep/secret.txt"));
    });

    it("resolves a `..` that stays inside allowRead", async () => {
      await mkdir(path.join(root, "sub"), { recursive: true });
      await writeFile(path.join(root, "a.txt"), "hi", "utf8");
      const resolved = await jail().resolveForRead("sub/../a.txt");
      expect(resolved).toBe(await realpath(path.join(root, "a.txt")));
    });
  });

  describe("resolveForWrite", () => {
    it("resolves a new file's path when the parent directory exists", async () => {
      const resolved = await jail().resolveForWrite("new.txt");
      expect(resolved).toBe(path.join(await realpath(root), "new.txt"));
    });

    it("resolves a new file in a nested existing directory", async () => {
      await mkdir(path.join(root, "sub"), { recursive: true });
      const resolved = await jail().resolveForWrite("sub/new.txt");
      expect(resolved).toBe(path.join(await realpath(path.join(root, "sub")), "new.txt"));
    });

    it("rejects when the parent directory doesn't exist", async () => {
      await expectInvalidInput(jail().resolveForWrite("missing-dir/new.txt"));
    });

    it("rejects an absolute path outside allowWrite", async () => {
      await expectInvalidInput(jail().resolveForWrite(path.join(outsideDir, "new.txt")));
    });

    it("allows an absolute path under allowWrite (even outside cwd)", async () => {
      const resolved = await jail({ allowWrite: [outsideDir] }).resolveForWrite(
        path.join(outsideDir, "new.txt"),
      );
      expect(resolved).toBe(path.join(await realpath(outsideDir), "new.txt"));
    });

    it("rejects a `..` traversal that escapes allowWrite", async () => {
      const relativeEscape = path.join("..", path.basename(outsideDir), "new.txt");
      await expectInvalidInput(jail().resolveForWrite(relativeEscape));
    });

    it("rejects a symlinked parent directory that points outside allowWrite", async () => {
      await symlink(outsideDir, path.join(root, "linked-dir"));
      await expectInvalidInput(jail().resolveForWrite("linked-dir/new.txt"));
    });

    it("rejects a new file whose parent is reached through a symlinked *ancestor*, not just the immediate parent", async () => {
      // Mirrors the resolveForRead case above, but for a not-yet-existing file: `link` is
      // two levels above the new file, with a real subdirectory (`deep`) — which does
      // exist — in between.
      await mkdir(path.join(outsideDir, "deep"), { recursive: true });
      await symlink(outsideDir, path.join(root, "link"));
      await expectInvalidInput(jail().resolveForWrite("link/deep/new.txt"));
    });

    it("rejects an existing leaf symlink that points outside allowWrite", async () => {
      const outsideFile = path.join(outsideDir, "secret.txt");
      await writeFile(outsideFile, "secret", "utf8");
      await symlink(outsideFile, path.join(root, "link.txt"));
      await expectInvalidInput(jail().resolveForWrite("link.txt"));
    });

    it("allows writing through an inbound leaf symlink that stays inside allowWrite", async () => {
      await writeFile(path.join(root, "target.txt"), "orig", "utf8");
      await symlink(path.join(root, "target.txt"), path.join(root, "link.txt"));
      const resolved = await jail().resolveForWrite("link.txt");
      expect(resolved).toBe(await realpath(path.join(root, "target.txt")));
    });

    it("rejects a write outside allowWrite even when the path stays under cwd", async () => {
      await mkdir(path.join(root, "only-here"), { recursive: true });
      await expectInvalidInput(
        jail({ allowWrite: [path.join(root, "only-here")] }).resolveForWrite("outside-allow.txt"),
      );
    });

    it("rejects every write when allowWrite is an empty list", async () => {
      await expectInvalidInput(jail({ allowWrite: [] }).resolveForWrite("anywhere.txt"));
    });

    it("allows a write under allowWrite", async () => {
      await mkdir(path.join(root, "only-here"), { recursive: true });
      const resolved = await jail({
        allowWrite: [path.join(root, "only-here")],
      }).resolveForWrite("only-here/ok.txt");
      expect(resolved).toBe(path.join(await realpath(path.join(root, "only-here")), "ok.txt"));
    });

    it("rejects a denyWrite path even under allowWrite", async () => {
      await mkdir(path.join(root, "hidden"), { recursive: true });
      await expectInvalidInput(
        jail({
          denyWrite: [path.join(root, "hidden")],
        }).resolveForWrite("hidden/x.txt"),
      );
    });

    it("denyWrite beats a narrower allowWrite that contains the path", async () => {
      await mkdir(path.join(root, "hidden"), { recursive: true });
      await expectInvalidInput(
        jail({
          allowWrite: [root],
          denyWrite: [path.join(root, "hidden")],
        }).resolveForWrite("hidden/x.txt"),
      );
    });
  });
});
