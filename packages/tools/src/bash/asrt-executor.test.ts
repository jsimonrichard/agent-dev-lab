import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import assert from "node:assert/strict";
import { after, describe, it } from "node:test";

import { SandboxManager } from "@anthropic-ai/sandbox-runtime";

import { createAsrtBashExecutor } from "./asrt-executor.ts";
import type { BashExecutorResult, BashExecutorUpdate } from "./executor.ts";

/**
 * These tests exercise the real `@anthropic-ai/sandbox-runtime` library against the actual
 * `bwrap`/`socat`/`rg` on this machine — no mocking. `SandboxManager` is a process-wide
 * singleton (see `asrt-executor.ts`'s doc comment): the first executor built anywhere in this
 * file to actually run a command wins its `{ allowWrite, denyRead, denyWrite, allowedDomains,
 * deniedDomains }` config for the rest of the process — later executors' configs are silently
 * ignored (ASRT's own `initialize()` is idempotent). So every test but the one that verifies
 * this directly shares one root directory and only varies `maxOutputBytes` (a purely local,
 * non-ASRT option) between executors, matching the one config actually in effect.
 *
 * `node:test` + `node:assert`, not `bun:test` — this is process/spawn-heavy code, exactly
 * where Bun and Node have been found to disagree (see `notes/tool-sandboxing.md`'s note on the
 * `spawn` PATH-resolution discrepancy found while building `native-executor.ts`). Runnable
 * under both `bun test` (as part of the normal suite) and `node --test` (`test:node` script).
 */

const root = await mkdtemp(path.join(tmpdir(), "adl-asrt-executor-"));
const allowedDir = path.join(root, "allowed");
const deniedDir = path.join(root, "denied");
await mkdir(allowedDir, { recursive: true });
await mkdir(deniedDir, { recursive: true });

const executor = createAsrtBashExecutor({ allowWrite: [allowedDir] });

after(async () => {
  // `asrt-executor.ts` deliberately never calls this itself (see its doc comment — tearing
  // down between individual commands in a long-lived process would kill the shared proxy for
  // every other in-flight command). A short-lived *test process* is a different lifecycle
  // point: verified directly that without this, the process never exits on its own — ASRT's
  // own "(optional, happens automatically on process exit)" claim did not hold up under plain
  // Node (see `notes/tool-sandboxing.md`). `bun test` masked this: it forcibly ends the whole
  // process at suite completion regardless of open handles, which stops the hang but silently
  // leaks every one of `SandboxManager`'s child processes (confirmed: dozens of orphaned
  // `socat` bridges accumulated across this file's *own* `bun test` runs). `node --test` does
  // not force anything — it waits for a natural exit — so this file hung indefinitely under
  // it until this line was added.
  await SandboxManager.reset();
  await rm(root, { recursive: true, force: true });
});

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

describe("createAsrtBashExecutor", () => {
  describe("allowRead", () => {
    // A second executor with a *different* config cannot be exercised here: SandboxManager is
    // a process-wide singleton and this file's shared `executor` already won the config (see
    // the header). So this suite asserts the config an executor reports, and the enforcement
    // itself is covered end-to-end by native-executor.test.ts, which has no such constraint.
    it("reports null when allowRead is omitted, matching ASRT's read-everywhere default", () => {
      assert.equal(executor.describe().allowRead, null);
    });

    it("reports the caller's roots, not the widened set handed to ASRT", () => {
      const bounded = createAsrtBashExecutor({
        allowWrite: [allowedDir],
        allowRead: [allowedDir],
      });
      const described = bounded.describe();
      // Resolved caller roots only — the system paths and ASRT's own package directory are an
      // implementation detail of enforcing the bound, not part of the promise.
      assert.deepEqual(described.allowRead, [allowedDir]);
      // And the broad denial that makes the carve-out mean anything is in place.
      assert.ok(described.denyRead.includes("/"), described.denyRead.join(","));
    });

    it("keeps a caller-supplied denyRead on top of the synthesized one", () => {
      const bounded = createAsrtBashExecutor({
        allowWrite: [allowedDir],
        allowRead: [allowedDir],
        denyRead: [deniedDir],
      });
      assert.deepEqual(bounded.describe().denyRead, ["/", deniedDir]);
    });
  });

  it(
    "runs a command and returns its stdout and a zero exit code",
    { timeout: 15_000 },
    async () => {
      const result = await finalResult(
        executor.run("echo hello", { cwd: allowedDir, timeoutMs: 10_000 }),
      );
      assert.equal(result.stdout.trim(), "hello");
      assert.equal(result.exitCode, 0);
      assert.equal(result.truncated, false);
    },
  );

  it("allows writing under an allowWrite path", { timeout: 15_000 }, async () => {
    const result = await finalResult(
      executor.run("echo written > ok.txt", { cwd: allowedDir, timeoutMs: 10_000 }),
    );
    assert.equal(result.exitCode, 0);
    assert.equal((await readFile(path.join(allowedDir, "ok.txt"), "utf8")).trim(), "written");
  });

  it(
    "denies writing outside allowWrite (a non-zero exit code, not a thrown error)",
    { timeout: 15_000 },
    async () => {
      const target = path.join(deniedDir, "nope.txt");
      const result = await finalResult(
        executor.run(`echo nope > ${target}`, { cwd: allowedDir, timeoutMs: 10_000 }),
      );
      assert.notEqual(result.exitCode, 0);
      await assert.rejects(readFile(target, "utf8"));
    },
  );

  it(
    "denies network access by default (no allowedDomains configured)",
    { timeout: 15_000 },
    async () => {
      const result = await finalResult(
        executor.run("curl -sS --max-time 5 https://example.com", {
          cwd: allowedDir,
          timeoutMs: 10_000,
        }),
      );
      assert.notEqual(result.exitCode, 0);
    },
  );

  it(
    "streams progress updates before the final one, cumulative and monotonically growing",
    { timeout: 15_000 },
    async () => {
      // `sleep` between writes so each write reliably lands in its own `data` event/update
      // instead of the OS coalescing them into one.
      const updates = await drainRun(
        executor.run("printf a; sleep 0.2; printf b; sleep 0.2; printf c", {
          cwd: allowedDir,
          timeoutMs: 10_000,
        }),
      );

      assert.ok(updates.length > 1);
      const last = updates.at(-1);
      assert.equal(last?.done, true);
      assert.equal(last?.stdout, "abc");

      // Every non-final update is progress (`done: false`), and stdout only ever grows —
      // it's cumulative, not a per-chunk delta.
      for (let i = 0; i < updates.length - 1; i++) {
        assert.equal(updates[i]?.done, false);
      }
      for (let i = 1; i < updates.length; i++) {
        const prevLength = updates[i - 1]?.stdout.length ?? 0;
        assert.ok((updates[i]?.stdout.length ?? 0) >= prevLength);
        assert.ok(updates[i]?.stdout.startsWith(updates[i - 1]?.stdout ?? ""));
      }
    },
  );

  it("truncates stdout at the configured byte cap", { timeout: 15_000 }, async () => {
    // Same ASRT config (`allowWrite: [allowedDir]`) as the shared `executor` above —
    // `maxOutputBytes` is a local option, not part of `SandboxRuntimeConfig`, so this
    // doesn't trip the "different config" guard; it reuses the already-initialized
    // `SandboxManager` singleton with its own smaller truncation cap.
    const smallCap = createAsrtBashExecutor({ allowWrite: [allowedDir], maxOutputBytes: 10 });
    const result = await finalResult(
      smallCap.run("printf '0123456789ABCDEF'", { cwd: allowedDir, timeoutMs: 10_000 }),
    );
    assert.equal(result.stdout.length, 10);
    assert.equal(result.truncated, true);
  });

  it("kills a command that runs past timeoutMs", { timeout: 15_000 }, async () => {
    const result = await finalResult(executor.run("sleep 5", { cwd: allowedDir, timeoutMs: 300 }));
    assert.notEqual(result.exitCode, 0);
  });

  it(
    "silently reuses the already-active config for a second executor built with a different one",
    { timeout: 15_000 },
    async () => {
      // Self-contained: don't rely on an earlier test in this file having already
      // initialized the shared singleton — initialize it here first, via `executor`.
      await finalResult(executor.run("true", { cwd: allowedDir, timeoutMs: 5_000 }));

      const differentRoot = await mkdtemp(path.join(tmpdir(), "adl-asrt-conflict-"));
      try {
        // ASRT's own `SandboxManager.initialize()` is idempotent — a second call, no matter
        // its config, just awaits the already-resolved initialization from `executor` above.
        // So `other` transparently shares `executor`'s `allowWrite: [allowedDir]`; its own
        // `allowWrite: [differentRoot]` never takes effect.
        const other = createAsrtBashExecutor({ allowWrite: [differentRoot] });

        const deniedInOwnRoot = await finalResult(
          other.run(`echo nope > ${path.join(differentRoot, "nope.txt")}`, {
            cwd: differentRoot,
            timeoutMs: 5_000,
          }),
        );
        assert.notEqual(deniedInOwnRoot.exitCode, 0);

        const allowedInSharedRoot = await finalResult(
          other.run("echo shared > shared.txt", { cwd: allowedDir, timeoutMs: 5_000 }),
        );
        assert.equal(allowedInSharedRoot.exitCode, 0);
        assert.equal(
          (await readFile(path.join(allowedDir, "shared.txt"), "utf8")).trim(),
          "shared",
        );
      } finally {
        await rm(differentRoot, { recursive: true, force: true });
      }
    },
  );
});

describe("createAsrtBashExecutor — missing dependencies", () => {
  it(
    "throws an AdlError naming what's missing and how to install it",
    { timeout: 20_000 },
    async () => {
      // Run in a fresh subprocess (rather than mutating this process's PATH) so it can't
      // affect the tests above, which need the real bwrap/socat/rg. The check script lives
      // under `src/bash/` (not a system temp dir) so its relative import of `asrt-executor.ts`
      // resolves node_modules the normal way, walking up from its own location.
      const fixtureDir = path.join(import.meta.dirname, ".missing-deps-fixture");
      await mkdir(fixtureDir, { recursive: true });
      try {
        const scriptPath = path.join(fixtureDir, "check.mjs");
        await writeFile(
          scriptPath,
          `
          import { createAsrtBashExecutor } from "../asrt-executor.ts";
          try {
            const executor = createAsrtBashExecutor({ allowWrite: [] });
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

        assert.ok(result.stderr.includes("ASRT sandbox dependencies missing"), result.stderr);
        assert.ok(result.stderr.includes("bwrap"), result.stderr);
        assert.ok(result.stderr.includes("socat"), result.stderr);
        assert.ok(result.stderr.includes("ripgrep"), result.stderr);
        assert.ok(result.stderr.includes("ERROR_CODE:INIT_FAILED"), result.stderr);
        assert.ok(!result.stderr.includes("UNEXPECTED_SUCCESS"), result.stderr);
      } finally {
        await rm(fixtureDir, { recursive: true, force: true });
      }
    },
  );
});
