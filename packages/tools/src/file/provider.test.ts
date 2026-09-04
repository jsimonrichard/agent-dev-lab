import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import type { ExtendedToolProviderContext } from "@agent-dev-lab/core";

import { createFileToolProvider, type FileToolProviderContext } from "./provider";

const toolCallOptions = { toolCallId: "test-tool-call", messages: [] as [] };

function ctx(
  toolProviderContext?: FileToolProviderContext,
): ExtendedToolProviderContext<FileToolProviderContext | undefined> {
  return { agentId: "test-agent", memoryScope: "test-scope", toolProviderContext };
}

let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "adl-file-provider-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("createFileToolProvider", () => {
  it("uses options.root as the default when context sets none", async () => {
    const provider = createFileToolProvider({ root });
    const { writeFile: writeFileTool } = await provider.getTools(ctx());
    await writeFileTool.execute?.({ path: "a.txt", content: "hi" }, toolCallOptions);
    expect(await readFile(path.join(root, "a.txt"), "utf8")).toBe("hi");
  });

  it("overrides options.root with toolProviderContext.root per call", async () => {
    const otherRoot = await mkdtemp(path.join(tmpdir(), "adl-file-provider-other-"));
    try {
      const provider = createFileToolProvider({ root });
      const { writeFile: writeFileTool } = await provider.getTools(ctx({ root: otherRoot }));
      await writeFileTool.execute?.({ path: "a.txt", content: "hi" }, toolCallOptions);
      expect(await readFile(path.join(otherRoot, "a.txt"), "utf8")).toBe("hi");
    } finally {
      await rm(otherRoot, { recursive: true, force: true });
    }
  });

  it("overrides options.maxWriteBytes with toolProviderContext.maxWriteBytes per call", async () => {
    const provider = createFileToolProvider({ root, maxWriteBytes: 1_000 });
    const { writeFile: writeFileTool } = await provider.getTools(ctx({ maxWriteBytes: 2 }));
    await expect(
      writeFileTool.execute?.({ path: "a.txt", content: "too long" }, toolCallOptions),
    ).rejects.toThrow();
  });

  it("throws when neither options.root nor toolProviderContext.root is given", () => {
    const provider = createFileToolProvider({});
    expect(() => provider.getTools(ctx())).toThrow();
  });

  it("reuses one cached FileTools instance for the same resolved root/caps", async () => {
    const provider = createFileToolProvider({ root });
    const first = await provider.getTools(ctx());
    const second = await provider.getTools(ctx());
    expect(first.readFile).toBe(second.readFile);
  });

  it("does not reuse the cached instance when maxReadBytes differs for the same root", async () => {
    const provider = createFileToolProvider({ root });
    const first = await provider.getTools(ctx({ maxReadBytes: 10 }));
    const second = await provider.getTools(ctx({ maxReadBytes: 20 }));
    expect(first.readFile).not.toBe(second.readFile);
  });

  it("describeFileEnv reports the resolved root/maxReadBytes/maxWriteBytes", async () => {
    const provider = createFileToolProvider({ root, maxReadBytes: 111, maxWriteBytes: 222 });
    const { describeFileEnv } = await provider.getTools(ctx());
    const result = await describeFileEnv.execute?.({}, toolCallOptions);
    expect(result).toEqual({
      fileAccess: { root: path.resolve(root), maxReadBytes: 111, maxWriteBytes: 222 },
    });
  });
});
