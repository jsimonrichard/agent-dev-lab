import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createAsyncChannel } from "@agent-dev-lab/core";

import type { BashExecutorUpdate } from "./executor.ts";
import { DEFAULT_MAX_OUTPUT_BYTES, runArgvIntoChannel } from "./process-channel.ts";

/**
 * `node:test` + `node:assert`, not `bun:test` — runnable under both `bun test` (as part of the
 * normal suite) and `node --test` (see `package.json`'s `test:node` script). This file is the
 * shared spawn/stream/truncate/timeout-kill primitive every `BashExecutor` in this package
 * builds on, so it's exactly the kind of process-handling code worth verifying against the
 * reference runtime (Node), not just Bun — see `notes/tool-sandboxing.md`'s note on the real
 * Bun/Node `spawn` PATH-resolution discrepancy found while building `native-executor.ts`.
 */

async function drain(argv: string[], timeoutMs = 5_000): Promise<BashExecutorUpdate[]> {
  const channel = createAsyncChannel<BashExecutorUpdate>();
  runArgvIntoChannel(
    argv,
    process.env,
    { cwd: process.cwd(), timeoutMs },
    DEFAULT_MAX_OUTPUT_BYTES,
    channel,
  );
  const updates: BashExecutorUpdate[] = [];
  for await (const update of channel) {
    updates.push(update);
  }
  return updates;
}

describe("runArgvIntoChannel", () => {
  it("runs argv and produces a final result with the right stdout and exit code", async () => {
    const updates = await drain(["/bin/sh", "-c", "echo hello"]);
    const last = updates.at(-1);
    assert.ok(last?.done);
    assert.equal(last.stdout, "hello\n");
    assert.equal(last.exitCode, 0);
    assert.equal(last.truncated, false);
  });

  it("captures stderr separately from stdout", async () => {
    const updates = await drain(["/bin/sh", "-c", "echo out; echo err >&2"]);
    const last = updates.at(-1);
    assert.ok(last?.done);
    assert.equal(last.stdout, "out\n");
    assert.equal(last.stderr, "err\n");
  });

  it("streams a progress update per chunk, cumulative, before the final one", async () => {
    const updates = await drain([
      "/bin/sh",
      "-c",
      "printf a; sleep 0.2; printf b; sleep 0.2; printf c",
    ]);
    assert.ok(updates.length > 1, `expected more than one update, got ${updates.length}`);
    const last = updates.at(-1);
    assert.ok(last?.done);
    assert.equal(last.stdout, "abc");
    for (let i = 0; i < updates.length - 1; i++) {
      assert.equal(updates[i]?.done, false);
    }
    for (let i = 1; i < updates.length; i++) {
      const prevStdout = updates[i - 1]?.stdout ?? "";
      assert.ok(updates[i]?.stdout.startsWith(prevStdout));
    }
  });

  it("truncates at the given byte cap", async () => {
    const channel = createAsyncChannel<BashExecutorUpdate>();
    runArgvIntoChannel(
      ["/bin/sh", "-c", "printf '0123456789ABCDEF'"],
      process.env,
      { cwd: process.cwd(), timeoutMs: 5_000 },
      10,
      channel,
    );
    const updates: BashExecutorUpdate[] = [];
    for await (const update of channel) {
      updates.push(update);
    }
    const last = updates.at(-1);
    assert.ok(last?.done);
    assert.equal(last.stdout.length, 10);
    assert.equal(last.truncated, true);
  });

  it("kills the process once timeoutMs elapses", { timeout: 10_000 }, async () => {
    const updates = await drain(["/bin/sh", "-c", "sleep 5"], 300);
    const last = updates.at(-1);
    assert.ok(last?.done);
    assert.notEqual(last.exitCode, 0);
  });

  it("fails the channel (rather than hanging) when the binary doesn't exist", async () => {
    const channel = createAsyncChannel<BashExecutorUpdate>();
    runArgvIntoChannel(
      ["/no/such/binary-at-all"],
      process.env,
      { cwd: process.cwd(), timeoutMs: 5_000 },
      DEFAULT_MAX_OUTPUT_BYTES,
      channel,
    );
    await assert.rejects(async () => {
      for await (const update of channel) {
        void update; // draining — the rejection surfaces from the loop itself
      }
    });
  });

  it("fails the channel with an AdlError on an empty argv", async () => {
    const channel = createAsyncChannel<BashExecutorUpdate>();
    runArgvIntoChannel(
      [],
      process.env,
      { cwd: process.cwd(), timeoutMs: 5_000 },
      DEFAULT_MAX_OUTPUT_BYTES,
      channel,
    );
    await assert.rejects(
      async () => {
        for await (const update of channel) {
          void update; // draining
        }
      },
      { message: /Empty argv/ },
    );
  });

  it("applies annotateStderr to both progress and final stderr", async () => {
    const channel = createAsyncChannel<BashExecutorUpdate>();
    runArgvIntoChannel(
      ["/bin/sh", "-c", "echo err >&2"],
      process.env,
      { cwd: process.cwd(), timeoutMs: 5_000 },
      DEFAULT_MAX_OUTPUT_BYTES,
      channel,
      (rawStderr) => `annotated:${rawStderr}`,
    );
    const updates: BashExecutorUpdate[] = [];
    for await (const update of channel) {
      updates.push(update);
    }
    const last = updates.at(-1);
    assert.ok(last?.done);
    assert.equal(last.stderr, "annotated:err\n");
  });
});
