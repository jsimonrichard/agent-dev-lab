import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createNativeBashExecutor } from "./native-executor.ts";
import type { BashExecutorResult, BashExecutorUpdate } from "./executor.ts";

/**
 * These tests exercise the real `bwrap` on this machine — no mocking. Unlike
 * `createAsrtBashExecutor`, `createNativeBashExecutor` carries no shared process-global state,
 * so each test is free to use its own root and config.
 *
 * `node:test` + `node:assert`, not `bun:test` — this is process/spawn-heavy code, exactly
 * where Bun and Node have been found to disagree (see `notes/tool-sandboxing.md`'s note on the
 * `spawn` PATH-resolution discrepancy found while building this file). Runnable under both
 * `bun test` (as part of the normal suite) and `node --test` (`package.json`'s `test:node`).
 */

/** Drains a `BashExecutor.run()` generator, returning every update it yielded, in order. */
async function drainRun(gen: AsyncGenerator<BashExecutorUpdate>): Promise<BashExecutorUpdate[]> {
  const updates: BashExecutorUpdate[] = [];
  for await (const update of gen) {
    updates.push(update);
  }
  return updates;
}

/** Drains a `BashExecutor.run()` generator and returns just its final `{ done: true, ... }`
 * result — the last update is always the final one (see `BashExecutor.run`'s doc comment). */
async function finalResult(gen: AsyncGenerator<BashExecutorUpdate>): Promise<BashExecutorResult> {
  const updates = await drainRun(gen);
  const last = updates.at(-1);
  if (!last || !last.done) {
    throw new Error(`Expected a final { done: true } update, got: ${JSON.stringify(last)}`);
  }
  return last;
}

describe("createNativeBashExecutor", () => {
  it(
    "runs a command and returns its stdout and a zero exit code",
    { timeout: 15_000 },
    async () => {
      const root = await mkdtemp(path.join(tmpdir(), "adl-native-executor-"));
      try {
        const executor = createNativeBashExecutor({ allowWrite: [root] });
        const result = await finalResult(
          executor.run("echo hello", { cwd: root, timeoutMs: 10_000 }),
        );
        assert.equal(result.stdout.trim(), "hello");
        assert.equal(result.exitCode, 0);
        assert.equal(result.truncated, false);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
  );

  it("allows writing under an allowWrite path", { timeout: 15_000 }, async () => {
    const root = await mkdtemp(path.join(tmpdir(), "adl-native-executor-"));
    try {
      const executor = createNativeBashExecutor({ allowWrite: [root] });
      const result = await finalResult(
        executor.run("echo written > ok.txt", { cwd: root, timeoutMs: 10_000 }),
      );
      assert.equal(result.exitCode, 0);
      assert.equal((await readFile(path.join(root, "ok.txt"), "utf8")).trim(), "written");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it(
    "denies writing outside allowWrite (a non-zero exit code, not a thrown error)",
    { timeout: 15_000 },
    async () => {
      const root = await mkdtemp(path.join(tmpdir(), "adl-native-executor-"));
      const allowed = path.join(root, "allowed");
      const denied = path.join(root, "denied");
      await mkdir(allowed, { recursive: true });
      await mkdir(denied, { recursive: true });
      try {
        const executor = createNativeBashExecutor({ allowWrite: [allowed] });
        const target = path.join(denied, "nope.txt");
        const result = await finalResult(
          executor.run(`echo nope > ${target}`, { cwd: allowed, timeoutMs: 10_000 }),
        );
        assert.notEqual(result.exitCode, 0);
        await assert.rejects(readFile(target, "utf8"));
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
  );

  it("denies network access by default", { timeout: 15_000 }, async () => {
    const root = await mkdtemp(path.join(tmpdir(), "adl-native-executor-"));
    try {
      const executor = createNativeBashExecutor({ allowWrite: [root] });
      const result = await finalResult(
        executor.run("curl -sS --max-time 5 https://example.com", {
          cwd: root,
          timeoutMs: 10_000,
        }),
      );
      assert.notEqual(result.exitCode, 0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("allows network access when allowNetwork is true", { timeout: 20_000 }, async () => {
    const root = await mkdtemp(path.join(tmpdir(), "adl-native-executor-"));
    try {
      const executor = createNativeBashExecutor({ allowWrite: [root], allowNetwork: true });
      const result = await finalResult(
        executor.run("curl -sS --max-time 8 -o /dev/null -w '%{http_code}' https://example.com", {
          cwd: root,
          timeoutMs: 15_000,
        }),
      );
      assert.equal(result.exitCode, 0);
      assert.equal(result.stdout.trim(), "200");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it(
    "hides a denyRead file as an empty file, not a missing path or a directory",
    { timeout: 15_000 },
    async () => {
      const root = await mkdtemp(path.join(tmpdir(), "adl-native-executor-"));
      const secretFile = path.join(root, "secret.txt");
      await writeFile(secretFile, "top-secret", "utf8");
      try {
        const executor = createNativeBashExecutor({
          allowWrite: [root],
          denyRead: [secretFile],
        });
        const result = await finalResult(
          executor.run(`cat ${secretFile}; echo "type:$(stat -c %F ${secretFile})"`, {
            cwd: root,
            timeoutMs: 10_000,
          }),
        );
        assert.equal(result.exitCode, 0);
        assert.ok(!result.stdout.includes("top-secret"));
        assert.ok(result.stdout.includes("type:regular empty file"));
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
  );

  it("hides the contents of a denyRead directory", { timeout: 15_000 }, async () => {
    const root = await mkdtemp(path.join(tmpdir(), "adl-native-executor-"));
    const secretDir = path.join(root, "secretdir");
    await mkdir(secretDir, { recursive: true });
    await writeFile(path.join(secretDir, "inside.txt"), "in-dir-secret", "utf8");
    try {
      const executor = createNativeBashExecutor({ allowWrite: [root], denyRead: [secretDir] });
      const result = await finalResult(
        executor.run(`cat ${path.join(secretDir, "inside.txt")}`, {
          cwd: root,
          timeoutMs: 10_000,
        }),
      );
      assert.notEqual(result.exitCode, 0);
      assert.ok(!result.stdout.includes("in-dir-secret"));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it(
    "a denyRead path nested inside allowWrite still wins (deny beats allow)",
    { timeout: 15_000 },
    async () => {
      const root = await mkdtemp(path.join(tmpdir(), "adl-native-executor-"));
      const secretFile = path.join(root, "secret.txt");
      await writeFile(secretFile, "top-secret", "utf8");
      try {
        const executor = createNativeBashExecutor({
          allowWrite: [root],
          denyRead: [secretFile],
        });
        const result = await finalResult(
          executor.run(`cat ${secretFile}`, { cwd: root, timeoutMs: 10_000 }),
        );
        assert.ok(!result.stdout.includes("top-secret"));
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
  );

  it(
    "streams progress updates before the final one, cumulative and monotonically growing",
    { timeout: 15_000 },
    async () => {
      const root = await mkdtemp(path.join(tmpdir(), "adl-native-executor-"));
      try {
        const executor = createNativeBashExecutor({ allowWrite: [root] });
        const updates = await drainRun(
          executor.run("printf a; sleep 0.2; printf b; sleep 0.2; printf c", {
            cwd: root,
            timeoutMs: 10_000,
          }),
        );

        assert.ok(updates.length > 1);
        const last = updates.at(-1);
        assert.equal(last?.done, true);
        assert.equal(last?.stdout, "abc");
        for (let i = 0; i < updates.length - 1; i++) {
          assert.equal(updates[i]?.done, false);
        }
        for (let i = 1; i < updates.length; i++) {
          const prevStdout = updates[i - 1]?.stdout ?? "";
          assert.ok(updates[i]?.stdout.startsWith(prevStdout));
        }
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
  );

  it("truncates stdout at the configured byte cap", { timeout: 15_000 }, async () => {
    const root = await mkdtemp(path.join(tmpdir(), "adl-native-executor-"));
    try {
      const executor = createNativeBashExecutor({ allowWrite: [root], maxOutputBytes: 10 });
      const result = await finalResult(
        executor.run("printf '0123456789ABCDEF'", { cwd: root, timeoutMs: 10_000 }),
      );
      assert.equal(result.stdout.length, 10);
      assert.equal(result.truncated, true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("kills a command that runs past timeoutMs", { timeout: 15_000 }, async () => {
    const root = await mkdtemp(path.join(tmpdir(), "adl-native-executor-"));
    try {
      const executor = createNativeBashExecutor({ allowWrite: [root] });
      const result = await finalResult(executor.run("sleep 5", { cwd: root, timeoutMs: 300 }));
      assert.notEqual(result.exitCode, 0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("throws a clear 'not implemented' error on darwin", () => {
    const original = process.platform;
    Object.defineProperty(process, "platform", { value: "darwin" });
    try {
      assert.throws(() => createNativeBashExecutor({ allowWrite: [] }), /not implemented yet/);
    } finally {
      Object.defineProperty(process, "platform", { value: original });
    }
  });

  it("throws a clear 'unsupported platform' error on win32", () => {
    const original = process.platform;
    Object.defineProperty(process, "platform", { value: "win32" });
    try {
      assert.throws(() => createNativeBashExecutor({ allowWrite: [] }), /no backend for platform/);
    } finally {
      Object.defineProperty(process, "platform", { value: original });
    }
  });
});

describe("createNativeBashExecutor — missing dependencies", () => {
  it(
    "throws an AdlError naming bubblewrap and how to install it",
    { timeout: 20_000 },
    async () => {
      // Run in a fresh subprocess (rather than mutating this process's PATH) so it can't
      // affect the tests above, which need the real bwrap. The check script lives under
      // `src/bash/` (not a system temp dir) so its relative import of `native-executor.ts`
      // resolves node_modules the normal way, walking up from its own location.
      const fixtureDir = path.join(import.meta.dirname, ".missing-bwrap-fixture");
      await mkdir(fixtureDir, { recursive: true });
      try {
        const scriptPath = path.join(fixtureDir, "check.mjs");
        await writeFile(
          scriptPath,
          `
          import { createNativeBashExecutor } from "../native-executor.ts";
          try {
            const executor = createNativeBashExecutor({ allowWrite: [] });
            for await (const _update of executor.run("echo hi", {
              cwd: ${JSON.stringify(fixtureDir)},
              timeoutMs: 5000,
            })) {
              // draining — the throw (if any) surfaces from the loop itself
            }
            console.error("UNEXPECTED_SUCCESS");
          } catch (error) {
            console.error("ERROR_MESSAGE:" + error.message);
            console.error("ERROR_CODE:" + (error.code ?? "none"));
          }
          `,
          "utf8",
        );

        // No "run" subcommand — plain `<runtime> <script>` works identically under both
        // Bun and Node, unlike `bun run <script>` (Bun-only CLI sugar).
        const result = spawnSync(process.execPath, [scriptPath], {
          env: { PATH: "" },
          encoding: "utf8",
          timeout: 15_000,
        });

        assert.ok(result.stderr.includes("bubblewrap (bwrap) not found"), result.stderr);
        assert.ok(result.stderr.includes("apt-get install bubblewrap"), result.stderr);
        assert.ok(result.stderr.includes("ERROR_CODE:INIT_FAILED"), result.stderr);
        assert.ok(!result.stderr.includes("UNEXPECTED_SUCCESS"), result.stderr);
      } finally {
        await rm(fixtureDir, { recursive: true, force: true });
      }
    },
  );
});
