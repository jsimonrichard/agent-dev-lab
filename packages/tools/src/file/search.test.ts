import { mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import { isAdlError } from "@agent-dev-lab/core";

import type { BashExecutor, BashExecutorRunOptions, BashExecutorUpdate } from "../bash/executor";
import { createSearchTools, globArgv, grepArgv } from "./search";

const toolCallOptions = { toolCallId: "test-tool-call", messages: [] as [] };

function stubExecutor(): BashExecutor & {
  calls: Array<{ argv: readonly string[]; opts: BashExecutorRunOptions }>;
} {
  const calls: Array<{ argv: readonly string[]; opts: BashExecutorRunOptions }> = [];
  return {
    calls,
    async *run(argv, opts) {
      calls.push({ argv, opts });
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
        allowWrite: [],
        allowRead: null,
        denyRead: [],
        denyWrite: [],
        network: { allowNetwork: false },
      };
    },
  };
}

async function drain<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const values: T[] = [];
  for await (const value of iterable) {
    values.push(value);
  }
  return values;
}

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

let root: string;
let outside: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "adl-search-root-"));
  outside = await mkdtemp(path.join(tmpdir(), "adl-search-outside-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
  await rm(outside, { recursive: true, force: true });
});

describe("grepArgv / globArgv", () => {
  it("puts the pattern after -- and never interpolates it into a flag", () => {
    expect(grepArgv("foo; $(whoami)", "/tmp/root")).toEqual([
      "rg",
      "--color=never",
      "--line-number",
      "--no-heading",
      "--fixed-strings",
      "--",
      "foo; $(whoami)",
      "/tmp/root",
    ]);
  });

  it("passes an optional glob as the value of --glob, not as a flag", () => {
    expect(grepArgv("needle", "/tmp/root", "--follow")).toEqual([
      "rg",
      "--color=never",
      "--line-number",
      "--no-heading",
      "--fixed-strings",
      "--glob",
      "--follow",
      "--",
      "needle",
      "/tmp/root",
    ]);
  });

  it("builds a --files argv for glob", () => {
    expect(globArgv("**/*.ts", "/tmp/root")).toEqual([
      "rg",
      "--files",
      "--color=never",
      "--glob",
      "**/*.ts",
      "--",
      "/tmp/root",
    ]);
  });
});

describe("createSearchTools", () => {
  it("rejects a non-positive timeoutMs at construction time", () => {
    expect(() => createSearchTools({ executor: stubExecutor(), root, timeoutMs: 0 })).toThrow();
  });

  describe("grep", () => {
    it("resolves the default path to the jail root and records a fixed argv", async () => {
      const executor = stubExecutor();
      const { grep } = createSearchTools({ executor, root });
      const result = grep.execute?.({ pattern: "needle" }, toolCallOptions);
      if (result) {
        await drain(result as AsyncIterable<BashExecutorUpdate>);
      }
      expect(executor.calls).toHaveLength(1);
      const argv = executor.calls[0]?.argv ?? [];
      expect(argv[0]).toBe("rg");
      expect(argv.includes("--")).toBe(true);
      expect(argv.at(-2)).toBe("needle");
      expect(argv.at(-1)).toBe(await realpath(root));
    });

    it("puts a metacharacter pattern in its own argv element", async () => {
      const executor = stubExecutor();
      const { grep } = createSearchTools({ executor, root });
      const pattern = "x; $(echo pwned) `echo pwned` && echo pwned";
      const result = grep.execute?.({ pattern }, toolCallOptions);
      if (result) {
        await drain(result as AsyncIterable<BashExecutorUpdate>);
      }
      expect(executor.calls[0]?.argv.includes(pattern)).toBe(true);
      expect(executor.calls[0]?.argv.join(" ").includes(`rg ${pattern}`)).toBe(false);
    });

    it("rejects a path that escapes the root when allowRead is the write root", async () => {
      const { grep } = createSearchTools({ executor: stubExecutor(), root, allowRead: [root] });
      const result = grep.execute?.({ pattern: "x", path: "../outside" }, toolCallOptions);
      await expectInvalidInput(
        Promise.resolve(result).then((iter) => drain(iter as AsyncIterable<unknown>)),
      );
    });

    it("rejects an absolute path outside allowRead", async () => {
      const { grep } = createSearchTools({ executor: stubExecutor(), root, allowRead: [root] });
      const result = grep.execute?.({ pattern: "x", path: "/etc/passwd" }, toolCallOptions);
      await expectInvalidInput(
        Promise.resolve(result).then((iter) => drain(iter as AsyncIterable<unknown>)),
      );
    });

    it("rejects a symlink that points outside the root when allowRead is the write root", async () => {
      await writeFile(path.join(outside, "secret.txt"), "needle secret\n");
      await symlink(outside, path.join(root, "link"));
      const { grep } = createSearchTools({ executor: stubExecutor(), root, allowRead: [root] });
      const result = grep.execute?.(
        { pattern: "needle", path: "link/secret.txt" },
        toolCallOptions,
      );
      await expectInvalidInput(
        Promise.resolve(result).then((iter) => drain(iter as AsyncIterable<unknown>)),
      );
    });
  });

  describe("glob", () => {
    it("records a --files argv rooted at the jail root", async () => {
      const executor = stubExecutor();
      const { glob } = createSearchTools({ executor, root });
      const result = glob.execute?.({ pattern: "**/*.ts" }, toolCallOptions);
      if (result) {
        await drain(result as AsyncIterable<BashExecutorUpdate>);
      }
      expect(executor.calls[0]?.argv[0]).toBe("rg");
      expect(executor.calls[0]?.argv.includes("--files")).toBe(true);
      expect(executor.calls[0]?.argv.includes("**/*.ts")).toBe(true);
    });
  });
});
