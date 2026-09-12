import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import assert from "node:assert/strict";
import { after, describe, it } from "node:test";

import { bashExecutorPoolSizeForTests, resetBashExecutorPoolForTests } from "./executor-pool.ts";
import { createBashToolProvider } from "./provider.ts";
import type { BashExecutorResult } from "./executor.ts";

/**
 * Spawn-level pool reuse — `node:test` so `node --test` waits for natural exit
 * (no leftover supervisors). See `asrt-executor.test.ts`.
 */

const root = await mkdtemp(path.join(tmpdir(), "adl-bash-pool-"));
const sandboxA = path.join(root, "a");
const sandboxB = path.join(root, "b");
await mkdir(sandboxA, { recursive: true });
await mkdir(sandboxB, { recursive: true });

after(async () => {
  await resetBashExecutorPoolForTests();
  await rm(root, { recursive: true, force: true });
});

const toolCallOptions = { toolCallId: "t", messages: [] as [] };

async function runBash(
  provider: ReturnType<typeof createBashToolProvider>,
  command: string,
  cwd: string,
  projectRoot: string,
): Promise<BashExecutorResult> {
  const { bash } = await provider.getTools({
    agentId: "pool-agent",
    agentCallId: "call-1",
    memoryScope: "scope",
    projectRoot,
    toolProviderContext: { cwd },
  });
  const gen = bash.execute?.({ command }, toolCallOptions);
  assert.ok(gen);
  let last: BashExecutorResult | undefined;
  for await (const update of gen as AsyncGenerator<BashExecutorResult>) {
    if (update.done) {
      last = update;
    }
  }
  assert.ok(last);
  return last;
}

describe("pooled createBashToolProvider (ASRT)", () => {
  it(
    "reuses one supervisor for the same policy and different cwd",
    { timeout: 30_000 },
    async () => {
      await resetBashExecutorPoolForTests();
      const provider = createBashToolProvider({
        allowWrite: [sandboxA],
        cwd: sandboxA,
      });
      const first = await runBash(provider, "echo one", sandboxA, root);
      assert.equal(first.exitCode, 0);
      assert.equal(bashExecutorPoolSizeForTests(), 1);

      const otherCwd = path.join(sandboxA, "subdir");
      await mkdir(otherCwd, { recursive: true });
      const second = await runBash(provider, "echo two", otherCwd, root);
      assert.equal(second.exitCode, 0);
      assert.equal(bashExecutorPoolSizeForTests(), 1);

      await provider.dispose?.();
      assert.equal(bashExecutorPoolSizeForTests(), 0);
    },
  );

  it("spawns a different executor when policy differs", { timeout: 30_000 }, async () => {
    await resetBashExecutorPoolForTests();
    const provider = createBashToolProvider({
      allowWrite: [sandboxA],
      cwd: sandboxA,
    });
    await runBash(provider, "echo a", sandboxA, root);
    assert.equal(bashExecutorPoolSizeForTests(), 1);

    await provider.getTools({
      agentId: "pool-agent",
      agentCallId: "call-2",
      memoryScope: "scope",
      projectRoot: root,
      toolProviderContext: { cwd: sandboxB, allowWrite: [sandboxB] },
    });
    assert.equal(bashExecutorPoolSizeForTests(), 2);

    await provider.dispose?.();
    assert.equal(bashExecutorPoolSizeForTests(), 0);
  });
});
