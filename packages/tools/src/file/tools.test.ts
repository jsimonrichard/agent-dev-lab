import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import { UNBOUNDED_ALLOW_READ } from "../unbounded-allow-read.ts";
import { createFileTools } from "./tools";

const toolCallOptions = {
  toolCallId: "test-tool-call",
  messages: [] as [],
};

let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "adl-file-tools-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("createFileTools", () => {
  describe("readFile", () => {
    it("reads an existing UTF-8 text file", async () => {
      await Bun.write(path.join(root, "a.txt"), "hello world");
      const { readFile: readFileTool } = createFileTools({ root });
      const result = await readFileTool.execute?.({ path: "a.txt" }, toolCallOptions);
      expect(result).toEqual({ content: "hello world" });
    });

    it("rejects a missing file", async () => {
      const { readFile: readFileTool } = createFileTools({ root });
      await expect(
        readFileTool.execute?.({ path: "missing.txt" }, toolCallOptions),
      ).rejects.toThrow();
    });

    it("rejects reading a directory", async () => {
      await mkdir(path.join(root, "sub"), { recursive: true });
      const { readFile: readFileTool } = createFileTools({ root });
      await expect(readFileTool.execute?.({ path: "sub" }, toolCallOptions)).rejects.toThrow();
    });

    it("rejects a file over the read byte cap", async () => {
      await Bun.write(path.join(root, "big.txt"), "0123456789");
      const { readFile: readFileTool } = createFileTools({ root, maxReadBytes: 5 });
      await expect(readFileTool.execute?.({ path: "big.txt" }, toolCallOptions)).rejects.toThrow();
    });

    it("rejects a path that escapes the root when allowRead is omitted (defaults to root)", async () => {
      const { readFile: readFileTool } = createFileTools({ root });
      await expect(
        readFileTool.execute?.({ path: "../outside.txt" }, toolCallOptions),
      ).rejects.toThrow();
    });

    it("rejects an absolute path outside the root when allowRead is omitted", async () => {
      const outsideDir = await mkdtemp(path.join(tmpdir(), "adl-file-tools-out-"));
      try {
        const outsideFile = path.join(outsideDir, "out.txt");
        await Bun.write(outsideFile, "out");
        const { readFile: readFileTool } = createFileTools({ root });
        await expect(
          readFileTool.execute?.({ path: outsideFile }, toolCallOptions),
        ).rejects.toThrow();
      } finally {
        await rm(outsideDir, { recursive: true, force: true });
      }
    });

    it("reads an absolute path outside the root when allowRead is UNBOUNDED_ALLOW_READ", async () => {
      const outsideDir = await mkdtemp(path.join(tmpdir(), "adl-file-tools-out-"));
      try {
        const outsideFile = path.join(outsideDir, "out.txt");
        await Bun.write(outsideFile, "out");
        const { readFile: readFileTool } = createFileTools({
          root,
          allowRead: UNBOUNDED_ALLOW_READ,
        });
        const result = await readFileTool.execute?.({ path: outsideFile }, toolCallOptions);
        expect(result).toEqual({ content: "out" });
      } finally {
        await rm(outsideDir, { recursive: true, force: true });
      }
    });
  });

  describe("writeFile", () => {
    it("creates a new file", async () => {
      const { writeFile: writeFileTool } = createFileTools({ root });
      const result = await writeFileTool.execute?.(
        { path: "new.txt", content: "hello" },
        toolCallOptions,
      );
      expect(result).toEqual({ bytesWritten: 5 });
      expect(await readFile(path.join(root, "new.txt"), "utf8")).toBe("hello");
    });

    it("overwrites an existing file", async () => {
      await Bun.write(path.join(root, "a.txt"), "old");
      const { writeFile: writeFileTool } = createFileTools({ root });
      await writeFileTool.execute?.({ path: "a.txt", content: "new" }, toolCallOptions);
      expect(await readFile(path.join(root, "a.txt"), "utf8")).toBe("new");
    });

    it("rejects when the parent directory doesn't exist", async () => {
      const { writeFile: writeFileTool } = createFileTools({ root });
      await expect(
        writeFileTool.execute?.({ path: "missing-dir/new.txt", content: "hi" }, toolCallOptions),
      ).rejects.toThrow();
    });

    it("rejects content over the write byte cap", async () => {
      const { writeFile: writeFileTool } = createFileTools({ root, maxWriteBytes: 3 });
      await expect(
        writeFileTool.execute?.({ path: "new.txt", content: "0123456789" }, toolCallOptions),
      ).rejects.toThrow();
    });

    it("rejects writing through an outbound leaf symlink", async () => {
      const outsideDir = await mkdtemp(path.join(tmpdir(), "adl-file-tools-symlink-out-"));
      try {
        const outsideFile = path.join(outsideDir, "secret.txt");
        await writeFile(outsideFile, "secret", "utf8");
        await symlink(outsideFile, path.join(root, "link.txt"));
        const { writeFile: writeFileTool } = createFileTools({ root });
        await expect(
          writeFileTool.execute?.({ path: "link.txt", content: "pwned" }, toolCallOptions),
        ).rejects.toThrow();
        expect(await readFile(outsideFile, "utf8")).toBe("secret");
      } finally {
        await rm(outsideDir, { recursive: true, force: true });
      }
    });

    it("allows writing through an inbound leaf symlink", async () => {
      await writeFile(path.join(root, "target.txt"), "orig", "utf8");
      await symlink(path.join(root, "target.txt"), path.join(root, "link.txt"));
      const { writeFile: writeFileTool } = createFileTools({ root });
      await writeFileTool.execute?.({ path: "link.txt", content: "via-link" }, toolCallOptions);
      expect(await readFile(path.join(root, "target.txt"), "utf8")).toBe("via-link");
    });

    it("rejects a write whose resolved path is outside allowWrite", async () => {
      await mkdir(path.join(root, "allowed"), { recursive: true });
      const { writeFile: writeFileTool } = createFileTools({
        root,
        allowWrite: [path.join(root, "allowed")],
      });
      await expect(
        writeFileTool.execute?.({ path: "elsewhere.txt", content: "nope" }, toolCallOptions),
      ).rejects.toThrow(/outside the allowed write roots/);
      await writeFileTool.execute?.({ path: "allowed/ok.txt", content: "yes" }, toolCallOptions);
      expect(await readFile(path.join(root, "allowed", "ok.txt"), "utf8")).toBe("yes");
    });
  });

  describe("editFile", () => {
    it("replaces a unique occurrence", async () => {
      await Bun.write(path.join(root, "a.txt"), "the quick brown fox");
      const { editFile: editFileTool } = createFileTools({ root });
      const result = await editFileTool.execute?.(
        { path: "a.txt", find: "brown", replace: "red" },
        toolCallOptions,
      );
      expect(result).toEqual({ bytesWritten: "the quick red fox".length });
      expect(await readFile(path.join(root, "a.txt"), "utf8")).toBe("the quick red fox");
    });

    it("rejects when `find` isn't in the file", async () => {
      await Bun.write(path.join(root, "a.txt"), "the quick brown fox");
      const { editFile: editFileTool } = createFileTools({ root });
      await expect(
        editFileTool.execute?.({ path: "a.txt", find: "purple", replace: "red" }, toolCallOptions),
      ).rejects.toThrow();
    });

    it("rejects when `find` appears more than once", async () => {
      await Bun.write(path.join(root, "a.txt"), "a a a");
      const { editFile: editFileTool } = createFileTools({ root });
      await expect(
        editFileTool.execute?.({ path: "a.txt", find: "a", replace: "b" }, toolCallOptions),
      ).rejects.toThrow();
      // Rejected edit must not partially apply.
      expect(await readFile(path.join(root, "a.txt"), "utf8")).toBe("a a a");
    });

    it("rejects when the result would exceed the write byte cap", async () => {
      await Bun.write(path.join(root, "a.txt"), "hi");
      const { editFile: editFileTool } = createFileTools({ root, maxWriteBytes: 3 });
      await expect(
        editFileTool.execute?.(
          { path: "a.txt", find: "hi", replace: "much too long" },
          toolCallOptions,
        ),
      ).rejects.toThrow();
    });

    it("rejects editing through an outbound leaf symlink", async () => {
      const outsideDir = await mkdtemp(path.join(tmpdir(), "adl-file-tools-edit-symlink-"));
      try {
        const outsideFile = path.join(outsideDir, "secret.txt");
        await writeFile(outsideFile, "the secret value", "utf8");
        await symlink(outsideFile, path.join(root, "link.txt"));
        const { editFile: editFileTool } = createFileTools({ root });
        await expect(
          editFileTool.execute?.(
            { path: "link.txt", find: "secret", replace: "pwned" },
            toolCallOptions,
          ),
        ).rejects.toThrow();
        expect(await readFile(outsideFile, "utf8")).toBe("the secret value");
      } finally {
        await rm(outsideDir, { recursive: true, force: true });
      }
    });
  });
});
