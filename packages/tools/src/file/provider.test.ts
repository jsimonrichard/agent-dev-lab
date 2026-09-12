import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import type { ExtendedToolProviderContext } from "@agent-dev-lab/core";

import { UNBOUNDED_ALLOW_READ } from "../unbounded-allow-read.ts";
import { createFileToolProvider, type FileToolProviderContext } from "./provider";

const toolCallOptions = { toolCallId: "test-tool-call", messages: [] as [] };

function ctx(
  toolProviderContext?: FileToolProviderContext,
): ExtendedToolProviderContext<FileToolProviderContext | undefined> {
  return {
    agentId: "test-agent",
    agentCallId: "call-1",
    memoryScope: "test-scope",
    toolProviderContext,
  };
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

  it("describeFileEnv reports the resolved root as allowRead when omitted", async () => {
    const provider = createFileToolProvider({ root, maxReadBytes: 111, maxWriteBytes: 222 });
    const { describeFileEnv } = await provider.getTools(ctx());
    const result = await describeFileEnv.execute?.({}, toolCallOptions);
    expect(result).toEqual({
      fileAccess: {
        root: path.resolve(root),
        allowRead: [path.resolve(root)],
        denyRead: [],
        maxReadBytes: 111,
        maxWriteBytes: 222,
      },
    });
  });

  it("describeFileEnv reports unbounded when constructed with UNBOUNDED_ALLOW_READ", async () => {
    const provider = createFileToolProvider({ root, allowRead: UNBOUNDED_ALLOW_READ });
    const { describeFileEnv } = await provider.getTools(ctx());
    const result = await describeFileEnv.execute?.({}, toolCallOptions);
    expect(result).toMatchObject({
      fileAccess: { allowRead: UNBOUNDED_ALLOW_READ, denyRead: [] },
    });
  });

  it("describeFileEnv reports an empty allowRead when constructed with null", async () => {
    const provider = createFileToolProvider({ root, allowRead: null });
    const { describeFileEnv } = await provider.getTools(ctx());
    const result = await describeFileEnv.execute?.({}, toolCallOptions);
    expect(result).toMatchObject({
      fileAccess: { allowRead: [], denyRead: [] },
    });
  });

  it("does not reuse the cached instance when allowRead differs for the same root", async () => {
    const provider = createFileToolProvider({ root });
    const first = await provider.getTools(ctx());
    const second = await provider.getTools(ctx({ allowRead: null }));
    expect(first.readFile).not.toBe(second.readFile);
  });

  it("does not treat allowWrite [] as omitted (cache and enforcement)", async () => {
    const provider = createFileToolProvider({ root });
    const omitted = await provider.getTools(ctx());
    const empty = await provider.getTools(ctx({ allowWrite: [] }));
    expect(omitted.writeFile).not.toBe(empty.writeFile);
    await expect(
      empty.writeFile.execute?.({ path: "nope.txt", content: "x" }, toolCallOptions),
    ).rejects.toThrow(/outside the allowed write roots/);
    await omitted.writeFile.execute?.({ path: "ok.txt", content: "yes" }, toolCallOptions);
    expect(await Bun.file(path.join(root, "ok.txt")).text()).toBe("yes");
  });

  it("treats toolProviderContext.allowRead null as nothing-readable, not as omitted", async () => {
    const provider = createFileToolProvider({ root });
    const { describeFileEnv, readFile: readFileTool } = await provider.getTools(
      ctx({ allowRead: null }),
    );
    await Bun.write(path.join(root, "a.txt"), "hi");
    const described = await describeFileEnv.execute?.({}, toolCallOptions);
    expect(described).toMatchObject({ fileAccess: { allowRead: [] } });
    await expect(readFileTool.execute?.({ path: "a.txt" }, toolCallOptions)).rejects.toThrow(
      /outside the allowed read roots/,
    );
  });
});
