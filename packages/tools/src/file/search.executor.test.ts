import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { BashExecutorUpdate } from "../bash/executor.ts";
import { createNativeBashExecutor } from "../bash/native-executor.ts";
import { createSearchTools } from "./search.ts";

const toolCallOptions = { toolCallId: "test-tool-call", messages: [] as [] };

async function drain<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const values: T[] = [];
  for await (const value of iterable) {
    values.push(value);
  }
  return values;
}

async function finalUpdate(
  result: AsyncIterable<BashExecutorUpdate> | undefined,
): Promise<Extract<BashExecutorUpdate, { done: true }>> {
  const updates = result ? await drain(result) : [];
  const last = updates.at(-1);
  if (!last || !last.done) {
    throw new Error(`Expected a final { done: true } update, got: ${JSON.stringify(last)}`);
  }
  return last;
}

describe("createSearchTools — native executor", () => {
  it(
    "matches a pattern containing shell metacharacters literally and executes nothing",
    { timeout: 15_000 },
    async () => {
      const root = await mkdtemp(path.join(tmpdir(), "adl-search-meta-"));
      try {
        const payload = "safe; $(echo pwned) `echo pwned` && echo pwned";
        await writeFile(path.join(root, "hit.txt"), `${payload}\n`);
        const executor = createNativeBashExecutor({ allowWrite: [root], allowRead: [root] });
        const { grep } = createSearchTools({ executor, root });
        const result = await finalUpdate(
          grep.execute?.(
            { pattern: payload },
            toolCallOptions,
          ) as AsyncIterable<BashExecutorUpdate>,
        );
        assert.equal(result.exitCode, 0);
        assert.match(result.stdout, /hit\.txt/);
        assert.match(result.stdout, /safe;/);
        const pwned = await finalUpdate(
          executor.run(["/bin/ls", root], { cwd: root, timeoutMs: 5_000 }),
        );
        assert.ok(!pwned.stdout.includes("pwned"), pwned.stdout);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
  );

  it(
    "does not return content from a symlink pointing outside the root",
    { timeout: 15_000 },
    async () => {
      const base = await mkdtemp(path.join(tmpdir(), "adl-search-symlink-"));
      const root = path.join(base, "root");
      const outside = path.join(base, "outside");
      await mkdir(root, { recursive: true });
      await mkdir(outside, { recursive: true });
      await writeFile(path.join(root, "in.txt"), "needle inside\n");
      await writeFile(path.join(outside, "secret.txt"), "needle secret\n");
      await symlink(outside, path.join(root, "link"));
      try {
        const executor = createNativeBashExecutor({ allowWrite: [root], allowRead: [root] });
        const { grep } = createSearchTools({ executor, root });
        const result = await finalUpdate(
          grep.execute?.(
            { pattern: "needle" },
            toolCallOptions,
          ) as AsyncIterable<BashExecutorUpdate>,
        );
        assert.match(result.stdout, /needle inside/);
        assert.ok(!result.stdout.includes("secret"), result.stdout);
      } finally {
        await rm(base, { recursive: true, force: true });
      }
    },
  );

  it("lists in-root files for glob and not an escaped sibling", { timeout: 15_000 }, async () => {
    const base = await mkdtemp(path.join(tmpdir(), "adl-search-glob-"));
    const root = path.join(base, "root");
    const outside = path.join(base, "outside");
    await mkdir(root, { recursive: true });
    await mkdir(outside, { recursive: true });
    await writeFile(path.join(root, "keep.ts"), "");
    await writeFile(path.join(outside, "leak.ts"), "");
    try {
      const executor = createNativeBashExecutor({ allowWrite: [root], allowRead: [root] });
      const { glob } = createSearchTools({ executor, root });
      const result = await finalUpdate(
        glob.execute?.(
          { pattern: "**/*.ts" },
          toolCallOptions,
        ) as AsyncIterable<BashExecutorUpdate>,
      );
      assert.match(result.stdout, /keep\.ts/);
      assert.ok(!result.stdout.includes("leak.ts"), result.stdout);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });
});
