import { describe, expect, it } from "bun:test";

import { UNBOUNDED_ALLOW_READ } from "../unbounded-allow-read.ts";
import type {
  BashExecutor,
  BashExecutorResult,
  BashExecutorRunOptions,
  BashExecutorUpdate,
} from "./executor";
import { createBashTool } from "./tools";

const toolCallOptions = {
  toolCallId: "test-tool-call",
  messages: [] as [],
};

function finalUpdate(
  overrides: Partial<Omit<BashExecutorResult, "done">> = {},
): BashExecutorResult {
  return { done: true, stdout: "", stderr: "", exitCode: 0, truncated: false, ...overrides };
}

/** A `BashExecutor` whose `run` yields exactly the given updates in order. */
function stubExecutor(
  handler: (argv: readonly string[], opts: BashExecutorRunOptions) => BashExecutorUpdate[],
): BashExecutor {
  return {
    async *run(argv, opts) {
      for (const update of handler(argv, opts)) {
        yield update;
      }
    },
    describe() {
      return {
        backend: "stub",
        allowWrite: [],
        allowRead: UNBOUNDED_ALLOW_READ,
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

describe("createBashTool", () => {
  it("passes the command, cwd, and default timeout through to the executor", async () => {
    let received: { argv: readonly string[]; opts: BashExecutorRunOptions } | undefined;
    const executor = stubExecutor((argv, opts) => {
      received = { argv, opts };
      return [finalUpdate({ stdout: "ok" })];
    });

    const { bash } = createBashTool({ executor, cwd: "/workspace" });
    const result = bash.execute?.({ command: "echo hi" }, toolCallOptions);
    if (result) {
      await drain(result as AsyncIterable<BashExecutorUpdate>);
    }

    expect(received?.argv).toEqual(["/bin/bash", "-c", "echo hi"]);
    expect(received?.opts.cwd).toBe("/workspace");
    expect(received?.opts.timeoutMs).toBe(30_000);
  });

  it("uses a custom timeoutMs when provided", async () => {
    let receivedTimeout: number | undefined;
    const executor = stubExecutor((_argv, opts) => {
      receivedTimeout = opts.timeoutMs;
      return [finalUpdate()];
    });

    const { bash } = createBashTool({ executor, cwd: "/workspace", timeoutMs: 5_000 });
    const result = bash.execute?.({ command: "echo hi" }, toolCallOptions);
    if (result) {
      await drain(result as AsyncIterable<BashExecutorUpdate>);
    }

    expect(receivedTimeout).toBe(5_000);
  });

  it("forwards the tool call's abortSignal to the executor", async () => {
    let receivedSignal: AbortSignal | undefined;
    const executor = stubExecutor((_argv, opts) => {
      receivedSignal = opts.signal;
      return [finalUpdate()];
    });

    const controller = new AbortController();
    const { bash } = createBashTool({ executor, cwd: "/workspace" });
    const result = bash.execute?.(
      { command: "echo hi" },
      { ...toolCallOptions, abortSignal: controller.signal },
    );
    if (result) {
      await drain(result as AsyncIterable<BashExecutorUpdate>);
    }

    expect(receivedSignal).toBe(controller.signal);
  });

  it("returns a non-zero exit code as data, not a thrown error", async () => {
    const executor = stubExecutor(() => [finalUpdate({ stderr: "no such file", exitCode: 1 })]);

    const { bash } = createBashTool({ executor, cwd: "/workspace" });
    const result = bash.execute?.({ command: "cat missing.txt" }, toolCallOptions);
    const updates = result ? await drain(result as AsyncIterable<BashExecutorUpdate>) : [];

    expect(updates).toEqual([
      { done: true, stdout: "", stderr: "no such file", exitCode: 1, truncated: false },
    ]);
  });

  it("streams progress updates through before the final one, unmodified", async () => {
    const progress: BashExecutorUpdate = {
      done: false,
      stdout: "partial",
      stderr: "",
      truncated: false,
    };
    const final = finalUpdate({ stdout: "partial done" });
    const executor = stubExecutor(() => [progress, final]);

    const { bash } = createBashTool({ executor, cwd: "/workspace" });
    const result = bash.execute?.({ command: "long-running" }, toolCallOptions);
    const updates = result ? await drain(result as AsyncIterable<BashExecutorUpdate>) : [];

    expect(updates).toEqual([progress, final]);
  });

  it("rejects a non-positive timeoutMs at construction time", () => {
    const executor = stubExecutor(() => [finalUpdate()]);
    expect(() => createBashTool({ executor, cwd: "/workspace", timeoutMs: 0 })).toThrow();
  });
});
