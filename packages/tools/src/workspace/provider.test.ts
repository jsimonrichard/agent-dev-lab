import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import type { ExtendedToolProviderContext } from "@agent-dev-lab/core";

import type { BashExecutor, BashExecutorRunOptions, BashExecutorUpdate } from "../bash/executor";

import { createWorkspaceToolProvider, type WorkspaceToolProviderContext } from "./provider";

const toolCallOptions = { toolCallId: "test-tool-call", messages: [] as [] };

function ctx(
  toolProviderContext?: WorkspaceToolProviderContext,
): ExtendedToolProviderContext<WorkspaceToolProviderContext | undefined> {
  return { agentId: "test-agent", memoryScope: "test-scope", toolProviderContext };
}

function stubExecutor(): BashExecutor & {
  calls: Array<{ command: string; opts: BashExecutorRunOptions }>;
} {
  const calls: Array<{ command: string; opts: BashExecutorRunOptions }> = [];
  return {
    calls,
    async *run(command, opts) {
      calls.push({ command, opts });
      yield {
        done: true,
        stdout: "",
        stderr: "",
        exitCode: 0,
        truncated: false,
      } satisfies BashExecutorUpdate;
    },
    describe() {
      return {
        backend: "stub",
        allowWrite: ["/allowed"],
        denyRead: [],
        denyWrite: [],
        network: { allowNetwork: false },
      };
    },
  };
}

/** Drains an async generator, returning every value it yielded, in order. */
async function drain<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const values: T[] = [];
  for await (const value of iterable) {
    values.push(value);
  }
  return values;
}

let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "adl-workspace-provider-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("createWorkspaceToolProvider", () => {
  it("uses one shared cwd for both the file jail root and the bash cwd", async () => {
    const executor = stubExecutor();
    const provider = createWorkspaceToolProvider({ executor, cwd: root });
    const { writeFile, bash } = await provider.getTools(ctx());

    await writeFile.execute?.({ path: "a.txt", content: "hi" }, toolCallOptions);
    expect(await readFile(path.join(root, "a.txt"), "utf8")).toBe("hi");

    await drain(
      (await bash.execute?.(
        { command: "echo hi" },
        toolCallOptions,
      )) as AsyncIterable<BashExecutorUpdate>,
    );
    expect(executor.calls[0]?.opts.cwd).toBe(root);
  });

  it("overrides the shared cwd via toolProviderContext for both file and bash tools", async () => {
    const otherRoot = await mkdtemp(path.join(tmpdir(), "adl-workspace-provider-other-"));
    try {
      const executor = stubExecutor();
      const provider = createWorkspaceToolProvider({ executor, cwd: root });
      const { writeFile, bash } = await provider.getTools(ctx({ cwd: otherRoot }));

      await writeFile.execute?.({ path: "a.txt", content: "hi" }, toolCallOptions);
      expect(await readFile(path.join(otherRoot, "a.txt"), "utf8")).toBe("hi");

      await drain(
        (await bash.execute?.(
          { command: "echo hi" },
          toolCallOptions,
        )) as AsyncIterable<BashExecutorUpdate>,
      );
      expect(executor.calls[0]?.opts.cwd).toBe(otherRoot);
    } finally {
      await rm(otherRoot, { recursive: true, force: true });
    }
  });

  it("throws when no cwd is given anywhere", () => {
    const provider = createWorkspaceToolProvider({ executor: stubExecutor() });
    expect(() => provider.getTools(ctx())).toThrow();
  });

  it("describeWorkspaceEnv reports both fileAccess and bashAccess together", async () => {
    const executor = stubExecutor();
    const provider = createWorkspaceToolProvider({ executor, cwd: root });
    const { describeWorkspaceEnv } = await provider.getTools(ctx());
    const result = await describeWorkspaceEnv.execute?.({}, toolCallOptions);
    expect(result).toEqual({
      fileAccess: {
        root: path.resolve(root),
        maxReadBytes: 1_000_000,
        maxWriteBytes: 1_000_000,
      },
      bashAccess: {
        cwd: root,
        timeoutMs: 30_000,
        backend: "stub",
        allowWrite: ["/allowed"],
        denyRead: [],
        denyWrite: [],
        network: { allowNetwork: false },
      },
    });
  });
});
