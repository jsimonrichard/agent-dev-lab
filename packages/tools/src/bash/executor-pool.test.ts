import { afterEach, describe, expect, it } from "bun:test";

import { AdlError } from "@agent-dev-lab/core";

import { UNBOUNDED_ALLOW_READ } from "../unbounded-allow-read.ts";
import {
  acquireBashExecutor,
  bashExecutorPoolMapForTests,
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
    // Omitted allowRead defaults to the write roots (not host-wide).
    expect(canonical.allowRead).toEqual(["/proj/a", "/proj/b"]);
    expect(canonical.allowEnv).toEqual([]);
  });

  it("keeps UNBOUNDED_ALLOW_READ when explicitly unbounded", () => {
    const canonical = canonicalizeBashSandboxPolicy("/proj", {
      allowWrite: ["sandbox"],
      allowRead: UNBOUNDED_ALLOW_READ,
    });
    expect(canonical.allowRead).toBe(UNBOUNDED_ALLOW_READ);
  });

  it("maps allowRead null to deny-all", () => {
    const canonical = canonicalizeBashSandboxPolicy("/proj", {
      allowWrite: ["sandbox"],
      allowRead: null,
    });
    expect(canonical.allowRead).toEqual([]);
  });

  it("canonicalizes allowEnv for the pool key", () => {
    const a = canonicalizeBashSandboxPolicy("/proj", {
      allowWrite: ["s"],
      allowEnv: [/^ADL_/, "FOO"],
    });
    const b = canonicalizeBashSandboxPolicy("/proj", {
      allowWrite: ["s"],
      allowEnv: ["FOO", /^ADL_/],
    });
    expect(a.allowEnv).toEqual(b.allowEnv);
    expect(a.allowEnv).toEqual([
      { kind: "regexp", source: "^ADL_", flags: "" },
      { kind: "string", value: "FOO" },
    ]);
  });

  it("resolves tmpDir against projectRoot", () => {
    const canonical = canonicalizeBashSandboxPolicy("/proj", {
      allowWrite: ["s"],
      tmpDir: "scratch",
    });
    expect(canonical.tmpDir).toBe("/proj/scratch");
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
            allowRead: UNBOUNDED_ALLOW_READ,
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

  it("rejects tmpDir on the native backend", () => {
    expect(() =>
      acquireBashExecutor({
        projectRoot: "/proj",
        backend: "native",
        policy: { allowWrite: ["/proj/s"], tmpDir: "/proj/tmp" },
      }),
    ).toThrow(/tmpDir/);
  });

  it("rejects a restricting native allowlist when allowNetwork is true", () => {
    expect(() =>
      acquireBashExecutor({
        projectRoot: "/proj",
        backend: "native",
        policy: {
          allowWrite: ["/proj/s"],
          allowNetwork: true,
          allowedDomains: ["example.com"],
        },
      }),
    ).toThrow(/per-host/);
  });

  it("rejects ASRT allowNetwork with an empty allowedDomains list", () => {
    expect(() =>
      acquireBashExecutor({
        projectRoot: "/proj",
        backend: "asrt",
        policy: { allowWrite: ["/proj/s"], allowNetwork: true, allowedDomains: [] },
      }),
    ).toThrow(/allowedDomains is empty/);
  });

  it("does not pass allowedDomains to ASRT while allowNetwork is false", () => {
    const { executor } = acquireBashExecutor({
      projectRoot: "/proj",
      backend: "asrt",
      policy: { allowWrite: ["/proj/a"], allowedDomains: ["*"] },
    });
    expect(executor.describe().network).toEqual({
      allowNetwork: false,
      allowedDomains: [],
      deniedDomains: [],
    });
  });
});

describe("bash executor pool globalThis pin", () => {
  it("stores the pool on Symbol.for so identity survives a fresh pool() lookup", async () => {
    const key = Symbol.for("@agent-dev-lab/tools:bashExecutorPool");
    const before = bashExecutorPoolMapForTests();
    const g = globalThis as typeof globalThis & { [key]?: Map<string, unknown> };
    expect(g[key]).toBe(before);

    acquireBashExecutor({
      projectRoot: "/proj",
      backend: "asrt",
      policy: { allowWrite: ["/proj/a"] },
    });
    expect(bashExecutorPoolMapForTests()).toBe(before);
    expect(bashExecutorPoolSizeForTests()).toBe(1);

    // Simulate what a re-evaluated module would see: same Symbol.for target, not a new Map.
    expect(g[key]).toBe(before);
    expect(g[key]!.size).toBe(1);
  });
});
