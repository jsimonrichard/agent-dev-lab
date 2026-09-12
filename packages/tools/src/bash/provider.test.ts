import { describe, expect, it } from "bun:test";

import type { ExtendedToolProviderContext } from "@agent-dev-lab/core";

import type { BashExecutor, BashExecutorRunOptions, BashExecutorUpdate } from "./executor";
import type { BashExecutorDescription } from "./executor";
import {
  createBashToolProvider,
  describeBashAccess,
  mergePolicy,
  UNBOUNDED_ALLOW_READ,
  type BashSafetyCheckInput,
  type BashSafetyCheckVerdict,
  type BashSafetyCheckWorkflow,
  type BashToolProviderContext,
} from "./provider";

const toolCallOptions = { toolCallId: "test-tool-call", messages: [] as [] };

function ctx(
  toolProviderContext?: BashToolProviderContext,
): ExtendedToolProviderContext<BashToolProviderContext | undefined> {
  return {
    agentId: "test-agent",
    agentCallId: "call-1",
    memoryScope: "test-scope",
    toolProviderContext,
  };
}

function finalUpdate(overrides: Partial<BashExecutorUpdate> = {}): BashExecutorUpdate {
  return { done: true, stdout: "", stderr: "", exitCode: 0, truncated: false, ...overrides };
}

/** A `BashExecutor` whose `run` yields exactly the given updates and records every call. */
function stubExecutor(
  handler: (argv: readonly string[], opts: BashExecutorRunOptions) => BashExecutorUpdate[] = () => [
    finalUpdate(),
  ],
): BashExecutor & { calls: Array<{ argv: readonly string[]; opts: BashExecutorRunOptions }> } {
  const calls: Array<{ argv: readonly string[]; opts: BashExecutorRunOptions }> = [];
  return {
    calls,
    async *run(argv, opts) {
      calls.push({ argv, opts });
      for (const update of handler(argv, opts)) {
        yield update;
      }
    },
    describe() {
      return {
        backend: "stub",
        allowWrite: ["/allowed"],
        allowRead: null,
        denyRead: ["/denied"],
        denyWrite: [],
        network: { allowNetwork: false },
      };
    },
  };
}

/** A `BashSafetyCheckWorkflow` stub — `resultFn`'s promise becomes `workflow.run(...).result`. */
function stubSafetyCheckWorkflow(
  resultFn: (input: BashSafetyCheckInput) => Promise<BashSafetyCheckVerdict>,
): BashSafetyCheckWorkflow {
  return {
    id: "stub-safety-check",
    run: (input) => ({ workflowRunId: "stub-run", result: resultFn(input), cancel: () => {} }),
    stream: (input) => ({
      workflowRunId: "stub-run",
      result: resultFn(input),
      cancel: () => {},
      events: (async function* () {})(),
    }),
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

describe("mergePolicy", () => {
  it("defaults omitted allowWrite and allowRead to [cwd]", () => {
    expect(mergePolicy("/sandbox", {}, undefined)).toEqual({
      allowWrite: ["/sandbox"],
      allowRead: ["/sandbox"],
      denyRead: undefined,
      denyWrite: undefined,
      allowedDomains: undefined,
      deniedDomains: undefined,
      allowNetwork: undefined,
      allowEnv: undefined,
    });
  });

  it("keeps an explicit allowWrite when cwd would differ", () => {
    expect(mergePolicy("/other", { allowWrite: ["/sandbox"] }, undefined).allowWrite).toEqual([
      "/sandbox",
    ]);
    expect(
      mergePolicy("/other", { allowWrite: ["/sandbox"] }, { allowRead: ["/sandbox"] }).allowWrite,
    ).toEqual(["/sandbox"]);
  });

  it("defaults omitted allowRead to the new cwd while keeping explicit allowWrite", () => {
    const merged = mergePolicy("/new-cwd", { allowWrite: ["/sandbox"] }, undefined);
    expect(merged.allowWrite).toEqual(["/sandbox"]);
    expect(merged.allowRead).toEqual(["/new-cwd"]);
  });

  it("treats null / UNBOUNDED_ALLOW_READ as unbounded", () => {
    expect(mergePolicy("/sandbox", { allowRead: null }, undefined).allowRead).toBeNull();
    expect(
      mergePolicy("/sandbox", { allowRead: UNBOUNDED_ALLOW_READ }, undefined).allowRead,
    ).toBeNull();
  });
});

describe("createBashToolProvider", () => {
  it("uses options.cwd as the default when context sets none", async () => {
    const executor = stubExecutor();
    const provider = createBashToolProvider({ executor, cwd: "/from-options" });
    const { bash } = await provider.getTools(ctx());
    await drain(
      (await bash.execute?.(
        { command: "echo hi" },
        toolCallOptions,
      )) as AsyncIterable<BashExecutorUpdate>,
    );
    expect(executor.calls[0]?.opts.cwd).toBe("/from-options");
  });

  it("overrides options.cwd with toolProviderContext.cwd per call", async () => {
    const executor = stubExecutor();
    const provider = createBashToolProvider({ executor, cwd: "/from-options" });
    const { bash } = await provider.getTools(ctx({ cwd: "/from-context" }));
    await drain(
      (await bash.execute?.(
        { command: "echo hi" },
        toolCallOptions,
      )) as AsyncIterable<BashExecutorUpdate>,
    );
    expect(executor.calls[0]?.opts.cwd).toBe("/from-context");
  });

  it("overrides options.timeoutMs with toolProviderContext.timeoutMs per call", async () => {
    const executor = stubExecutor();
    const provider = createBashToolProvider({ executor, cwd: "/root", timeoutMs: 5_000 });
    const { bash } = await provider.getTools(ctx({ timeoutMs: 9_000 }));
    await drain(
      (await bash.execute?.(
        { command: "echo hi" },
        toolCallOptions,
      )) as AsyncIterable<BashExecutorUpdate>,
    );
    expect(executor.calls[0]?.opts.timeoutMs).toBe(9_000);
  });

  it("throws when neither options.cwd nor toolProviderContext.cwd is given", () => {
    const provider = createBashToolProvider({ executor: stubExecutor() });
    expect(() => provider.getTools(ctx())).toThrow();
  });

  it("describeBashEnv reports the resolved cwd/timeoutMs and the executor's own config", async () => {
    const executor = stubExecutor();
    const provider = createBashToolProvider({ executor, cwd: "/root", timeoutMs: 12_345 });
    const { describeBashEnv } = await provider.getTools(ctx());
    const result = await describeBashEnv.execute?.({}, toolCallOptions);
    expect(result).toEqual({
      bashAccess: {
        cwd: "/root",
        timeoutMs: 12_345,
        backend: "stub",
        allowWrite: ["/allowed"],
        allowRead: UNBOUNDED_ALLOW_READ,
        denyRead: ["/denied"],
        denyWrite: [],
        network: { allowNetwork: false, allowedDomains: [], deniedDomains: [] },
      },
    });
  });

  describe("describeBashAccess", () => {
    function executorWith(described: BashExecutorDescription): BashExecutor {
      return {
        async *run() {
          yield { done: true, stdout: "", stderr: "", exitCode: 0, truncated: false };
        },
        describe: () => described,
      };
    }

    it("maps executor allowRead null to the unbounded sentinel", () => {
      const access = describeBashAccess(
        executorWith({
          backend: "stub",
          allowWrite: ["/w"],
          allowRead: null,
          denyRead: [],
          denyWrite: [],
          network: { allowNetwork: false },
        }),
        "/cwd",
        1,
      );
      expect(access.allowRead).toBe(UNBOUNDED_ALLOW_READ);
      expect(access.network).toEqual({
        allowNetwork: false,
        allowedDomains: [],
        deniedDomains: [],
      });
    });

    it("keeps an explicit empty allowRead bound (fail-closed, not the omitted default)", () => {
      const access = describeBashAccess(
        executorWith({
          backend: "stub",
          allowWrite: ["/w"],
          allowRead: [],
          denyRead: [],
          denyWrite: [],
          network: { allowNetwork: false },
        }),
        "/cwd",
        1,
      );
      expect(access.allowRead).toEqual([]);
    });

    it("fills null deny lists and omitted domain lists with empty arrays", () => {
      const access = describeBashAccess(
        executorWith({
          backend: "stub",
          allowWrite: ["/w"],
          allowRead: ["/r"],
          // Runtime sentinels a sloppy describe() might still emit.
          denyRead: null as unknown as string[],
          denyWrite: undefined as unknown as string[],
          network: { allowNetwork: true, allowedDomains: ["example.com"] },
        }),
        "/cwd",
        1,
      );
      expect(access.denyRead).toEqual([]);
      expect(access.denyWrite).toEqual([]);
      expect(access.network).toEqual({
        allowNetwork: true,
        allowedDomains: ["example.com"],
        deniedDomains: [],
      });
    });
  });

  describe("safetyCheck", () => {
    it("runs the command when the safety check reports safe", async () => {
      const executor = stubExecutor();
      const safetyCheck = stubSafetyCheckWorkflow(async () => ({ safe: true, reason: "fine" }));
      const provider = createBashToolProvider({ executor, cwd: "/root", safetyCheck });
      const { bash } = await provider.getTools(ctx());
      const updates = await drain(
        (await bash.execute?.(
          { command: "echo hi" },
          toolCallOptions,
        )) as AsyncIterable<BashExecutorUpdate>,
      );
      expect(executor.calls).toHaveLength(1);
      expect(updates).toEqual([finalUpdate()]);
    });

    it("blocks the command (as data, not a thrown error) when the safety check reports unsafe", async () => {
      const executor = stubExecutor();
      const safetyCheck = stubSafetyCheckWorkflow(async () => ({
        safe: false,
        reason: "looks like a fork bomb",
      }));
      const provider = createBashToolProvider({ executor, cwd: "/root", safetyCheck });
      const { bash } = await provider.getTools(ctx());
      const updates = await drain(
        (await bash.execute?.(
          { command: ":(){ :|:& };:" },
          toolCallOptions,
        )) as AsyncIterable<BashExecutorUpdate>,
      );
      expect(executor.calls).toHaveLength(0);
      expect(updates).toEqual([
        {
          done: true,
          stdout: "",
          stderr: "Blocked by safety check: looks like a fork bomb",
          exitCode: 1,
          truncated: false,
        },
      ]);
    });

    it("fails closed (blocks) when the safety check workflow rejects", async () => {
      const executor = stubExecutor();
      const safetyCheck = stubSafetyCheckWorkflow(async () => {
        throw new Error("checker unavailable");
      });
      const provider = createBashToolProvider({ executor, cwd: "/root", safetyCheck });
      const { bash } = await provider.getTools(ctx());
      const updates = await drain(
        (await bash.execute?.(
          { command: "echo hi" },
          toolCallOptions,
        )) as AsyncIterable<BashExecutorUpdate>,
      );
      expect(executor.calls).toHaveLength(0);
      const last = updates.at(-1);
      expect(last?.done).toBe(true);
      expect((last as { stderr: string }).stderr).toContain("checker unavailable");
      expect((last as { exitCode: number }).exitCode).not.toBe(0);
    });
  });
});
