import { afterEach, describe, expect, it } from "bun:test";

import { AdlError } from "@agent-dev-lab/core";

import {
  acquireBashExecutor,
  bashExecutorPoolSizeForTests,
  canonicalizeBashSandboxPolicy,
  releaseBashExecutor,
  resetBashExecutorPoolForTests,
} from "./executor-pool.ts";
import { createBashToolProvider } from "./provider.ts";

afterEach(async () => {
  await resetBashExecutorPoolForTests();
});

describe("canonicalizeBashSandboxPolicy", () => {
  it("resolves paths against projectRoot and sorts them", () => {
    const canonical = canonicalizeBashSandboxPolicy("/proj", {
      allowWrite: ["b", "a", "/proj/a"],
      denyRead: ["z", "y"],
      allowedDomains: ["b.com", "a.com", "a.com"],
    });
    expect(canonical.allowWrite).toEqual(["/proj/a", "/proj/b"]);
    expect(canonical.denyRead).toEqual(["/proj/y", "/proj/z"]);
    expect(canonical.allowedDomains).toEqual(["a.com", "b.com"]);
    expect(canonical.allowRead).toBeNull();
  });
});

describe("bash executor pool refcounts", () => {
  it("reuses the same executor for the same key and disposes at refcount 0", async () => {
    const first = acquireBashExecutor({
      projectRoot: "/proj",
      backend: "asrt",
      policy: { allowWrite: ["/proj/sandbox"] },
    });
    const second = acquireBashExecutor({
      projectRoot: "/proj",
      backend: "asrt",
      policy: { allowWrite: ["sandbox"] },
    });
    expect(second.executor).toBe(first.executor);
    expect(second.key).toBe(first.key);
    expect(bashExecutorPoolSizeForTests()).toBe(1);

    await releaseBashExecutor(first.key);
    expect(bashExecutorPoolSizeForTests()).toBe(1);
    await releaseBashExecutor(second.key);
    expect(bashExecutorPoolSizeForTests()).toBe(0);
  });

  it("does not share across project roots", () => {
    const a = acquireBashExecutor({
      projectRoot: "/a",
      backend: "asrt",
      policy: { allowWrite: ["/a/sandbox"] },
    });
    const b = acquireBashExecutor({
      projectRoot: "/b",
      backend: "asrt",
      policy: { allowWrite: ["/b/sandbox"] },
    });
    expect(a.executor).not.toBe(b.executor);
    expect(bashExecutorPoolSizeForTests()).toBe(2);
  });

  it("throws when projectRoot is missing", () => {
    expect(() =>
      acquireBashExecutor({
        projectRoot: undefined,
        backend: "asrt",
        policy: { allowWrite: ["/tmp"] },
      }),
    ).toThrow(AdlError);
  });
});

describe("createBashToolProvider pooled vs executor", () => {
  it("rejects executor together with policy fields", () => {
    expect(() =>
      createBashToolProvider({
        executor: {
          async *run() {
            yield { done: true, stdout: "", stderr: "", exitCode: 0, truncated: false };
          },
          describe: () => ({
            backend: "stub",
            allowWrite: [],
            allowRead: null,
            denyRead: [],
            denyWrite: [],
            network: { allowNetwork: false },
          }),
        },
        allowWrite: ["/tmp"],
        cwd: "/tmp",
      }),
    ).toThrow(/either executor or sandbox policy/);
  });

  it("acquires from the pool when policy is given", async () => {
    const provider = createBashToolProvider({
      allowWrite: ["/tmp/sandbox"],
      cwd: "/tmp/sandbox",
    });
    await provider.getTools({
      agentId: "a",
      agentCallId: "c1",
      memoryScope: "s",
      projectRoot: "/tmp",
    });
    expect(bashExecutorPoolSizeForTests()).toBe(1);
    await provider.dispose?.();
    expect(bashExecutorPoolSizeForTests()).toBe(0);
  });
});
