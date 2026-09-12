import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import assert from "node:assert/strict";
import { after, describe, it } from "node:test";

import { SandboxManager } from "@anthropic-ai/sandbox-runtime";

import { createAsrtBashExecutor } from "./asrt-executor.ts";
import type { AsrtBashExecutorOptions } from "./asrt-executor.ts";
import type { BashExecutor, BashExecutorResult, BashExecutorUpdate } from "./executor.ts";

/**
 * These tests exercise the real `@anthropic-ai/sandbox-runtime` library against the actual
 * `bwrap`/`socat`/`rg` on this machine — no mocking. Each `createAsrtBashExecutor` owns a
 * supervisor child that holds that instance's `SandboxManager`, so tests may use different
 * filesystem and domain policies in one process. The host process must never initialize
 * ASRT itself; `dispose()` ends the supervisor (stdin keepalive / parent-death also kill it).
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

const live: BashExecutor[] = [];

function asrt(options: AsrtBashExecutorOptions): BashExecutor {
  const executor = createAsrtBashExecutor(options);
  live.push(executor);
  return executor;
}

const executor = asrt({ allowWrite: [allowedDir] });

after(async () => {
  for (const item of live) {
    await item.dispose?.();
  }
  await rm(root, { recursive: true, force: true });
});

/** The bash tool's own wrap — existing tests that need a shell keep going through it. */
function sh(command: string): string[] {
  return ["/bin/bash", "-c", command];
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

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
    it("reports allowWrite when allowRead is omitted", () => {
      assert.deepEqual(executor.describe().allowRead, [allowedDir]);
    });

    it("reports null when allowRead is explicitly null (unbounded)", () => {
      const unbounded = asrt({ allowWrite: [allowedDir], allowRead: null });
      assert.equal(unbounded.describe().allowRead, null);
    });

    it("reports the caller's roots, not the widened set handed to ASRT", () => {
      const bounded = asrt({
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
      const bounded = asrt({
        allowWrite: [allowedDir],
        allowRead: [allowedDir],
        denyRead: [deniedDir],
      });
      assert.deepEqual(bounded.describe().denyRead, ["/", deniedDir]);
    });

    it(
      "enforces allowRead in its own supervisor, independent of the shared executor",
      { timeout: 15_000 },
      async () => {
        const secret = path.join(deniedDir, "secret.txt");
        await writeFile(secret, "classified\n", "utf8");
        const bounded = asrt({
          allowWrite: [allowedDir],
          allowRead: [allowedDir],
        });
        const result = await finalResult(
          bounded.run(sh(`cat ${secret}`), { cwd: allowedDir, timeoutMs: 10_000 }),
        );
        assert.notEqual(result.exitCode, 0);
      },
    );

    it(
      "defaults omitted allowRead to allowWrite (shared executor cannot read deniedDir)",
      { timeout: 15_000 },
      async () => {
        const secret = path.join(deniedDir, "secret.txt");
        await writeFile(secret, "classified\n", "utf8");
        const result = await finalResult(
          executor.run(sh(`cat ${secret}`), { cwd: allowedDir, timeoutMs: 10_000 }),
        );
        assert.notEqual(result.exitCode, 0);
      },
    );
  });

  it(
    "runs a command and returns its stdout and a zero exit code",
    { timeout: 15_000 },
    async () => {
      const result = await finalResult(
        executor.run(sh("echo hello"), { cwd: allowedDir, timeoutMs: 10_000 }),
      );
      assert.equal(result.stdout.trim(), "hello");
      assert.equal(result.exitCode, 0);
      assert.equal(result.truncated, false);
    },
  );

  it("hides host secrets from printenv by default", { timeout: 15_000 }, async () => {
    const secret = "ADL_ASRT_ENV_SECRET_VALUE";
    const prev = process.env.ADL_ASRT_ENV_SECRET;
    process.env.ADL_ASRT_ENV_SECRET = secret;
    try {
      const result = await finalResult(
        executor.run(sh("printenv"), { cwd: allowedDir, timeoutMs: 10_000 }),
      );
      assert.equal(result.exitCode, 0);
      assert.ok(!result.stdout.includes(secret), result.stdout);
      assert.ok(!result.stdout.includes("ADL_ASRT_ENV_SECRET"), result.stdout);
    } finally {
      if (prev === undefined) {
        delete process.env.ADL_ASRT_ENV_SECRET;
      } else {
        process.env.ADL_ASRT_ENV_SECRET = prev;
      }
    }
  });

  it("passes an allowlisted name into the sandbox", { timeout: 15_000 }, async () => {
    const prev = process.env.ADL_ASRT_ENV_FOO;
    process.env.ADL_ASRT_ENV_FOO = "bar";
    try {
      const withEnv = asrt({ allowWrite: [allowedDir], allowEnv: ["ADL_ASRT_ENV_FOO"] });
      const result = await finalResult(
        withEnv.run(sh("printenv ADL_ASRT_ENV_FOO"), { cwd: allowedDir, timeoutMs: 10_000 }),
      );
      assert.equal(result.exitCode, 0);
      assert.equal(result.stdout.trim(), "bar");
    } finally {
      if (prev === undefined) {
        delete process.env.ADL_ASRT_ENV_FOO;
      } else {
        process.env.ADL_ASRT_ENV_FOO = prev;
      }
    }
  });

  it("allows writing under an allowWrite path", { timeout: 15_000 }, async () => {
    const result = await finalResult(
      executor.run(sh("echo written > ok.txt"), { cwd: allowedDir, timeoutMs: 10_000 }),
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
        executor.run(sh(`echo nope > ${target}`), { cwd: allowedDir, timeoutMs: 10_000 }),
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
        executor.run(sh("curl -sS --max-time 5 https://example.com"), {
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
        executor.run(sh("printf a; sleep 0.2; printf b; sleep 0.2; printf c"), {
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
    const smallCap = asrt({ allowWrite: [allowedDir], maxOutputBytes: 10 });
    const result = await finalResult(
      smallCap.run(sh("printf '0123456789ABCDEF'"), { cwd: allowedDir, timeoutMs: 10_000 }),
    );
    assert.equal(result.stdout.length, 10);
    assert.equal(result.truncated, true);
  });

  it(
    "treats shell metacharacters in an argv element as literal text",
    { timeout: 15_000 },
    async () => {
      const payload = "safe; $(echo pwned) `echo pwned` && echo pwned";
      const result = await finalResult(
        executor.run(["/bin/echo", payload], { cwd: allowedDir, timeoutMs: 10_000 }),
      );
      assert.equal(result.exitCode, 0);
      assert.equal(result.stdout.trim(), payload);
    },
  );

  it("treats single quotes in an argv element as literal text", { timeout: 15_000 }, async () => {
    // Same breakout as the native test: a `'…'` wrap would run
    // `/bin/echo INJECTED`. ASRT puts the value in $ADL_ARGV_* and
    // exec's `"$ADL_ARGV_N"` — the quotes never appear in the script.
    const payload = "'; /bin/echo INJECTED; '";
    const result = await finalResult(
      executor.run(["/bin/echo", payload], { cwd: allowedDir, timeoutMs: 10_000 }),
    );
    assert.equal(result.exitCode, 0);
    assert.equal(result.stdout.trim(), payload);
  });

  it("fails closed on an empty argv", { timeout: 15_000 }, async () => {
    await assert.rejects(
      () => finalResult(executor.run([], { cwd: allowedDir, timeoutMs: 5_000 })),
      /Empty argv/,
    );
  });

  it("kills a command that runs past timeoutMs", { timeout: 15_000 }, async () => {
    const result = await finalResult(
      executor.run(sh("sleep 5"), { cwd: allowedDir, timeoutMs: 300 }),
    );
    assert.notEqual(result.exitCode, 0);
  });

  it("isolates two executors with different allowWrite policies", { timeout: 20_000 }, async () => {
    const otherRoot = await mkdtemp(path.join(tmpdir(), "adl-asrt-isolated-"));
    try {
      const other = asrt({ allowWrite: [otherRoot] });
      const wroteHere = await finalResult(
        executor.run(sh("echo shared > isolated-a.txt"), {
          cwd: allowedDir,
          timeoutMs: 10_000,
        }),
      );
      const wroteThere = await finalResult(
        other.run(sh("echo other > isolated-b.txt"), {
          cwd: otherRoot,
          timeoutMs: 10_000,
        }),
      );
      assert.equal(wroteHere.exitCode, 0);
      assert.equal(wroteThere.exitCode, 0);
      assert.equal(
        (await readFile(path.join(allowedDir, "isolated-a.txt"), "utf8")).trim(),
        "shared",
      );
      assert.equal(
        (await readFile(path.join(otherRoot, "isolated-b.txt"), "utf8")).trim(),
        "other",
      );

      const cross = await finalResult(
        executor.run(sh(`echo nope > ${path.join(otherRoot, "crossed.txt")}`), {
          cwd: allowedDir,
          timeoutMs: 10_000,
        }),
      );
      assert.notEqual(cross.exitCode, 0);
      await assert.rejects(readFile(path.join(otherRoot, "crossed.txt"), "utf8"));

      // Isolation proof: ASRT never ran in this host process.
      assert.equal(SandboxManager.getConfig(), undefined);
    } finally {
      await rm(otherRoot, { recursive: true, force: true });
    }
  });

  it(
    "leaves the host SandboxManager uninitialized after a successful run",
    { timeout: 15_000 },
    async () => {
      await finalResult(executor.run(sh("true"), { cwd: allowedDir, timeoutMs: 5_000 }));
      assert.equal(SandboxManager.getConfig(), undefined);
    },
  );

  it(
    "supervisor dies when the host process exits without dispose",
    { timeout: 20_000 },
    async () => {
      const fixtureDir = path.join(import.meta.dirname, ".orphan-supervisor-fixture");
      await mkdir(fixtureDir, { recursive: true });
      try {
        const scriptPath = path.join(fixtureDir, "check.mjs");
        await writeFile(
          scriptPath,
          `
          import { execSync } from "node:child_process";
          import { createAsrtBashExecutor } from "../asrt-executor.ts";
          const executor = createAsrtBashExecutor({ allowWrite: ${JSON.stringify([allowedDir])} });
          for await (const _update of executor.run(["/bin/true"], {
            cwd: ${JSON.stringify(allowedDir)},
            timeoutMs: 5000,
          })) {
            // drain
          }
          const kids = execSync("pgrep -P " + String(process.pid), { encoding: "utf8" })
            .trim()
            .split("\\n")
            .filter(Boolean);
          console.log("SUPERVISOR_PIDS:" + kids.join(","));
          process.exit(0);
          `,
          "utf8",
        );

        const result = spawnSync(process.execPath, [scriptPath], {
          encoding: "utf8",
          timeout: 15_000,
        });
        assert.equal(result.status, 0, result.stderr);
        const match = /SUPERVISOR_PIDS:([0-9,]+)/.exec(result.stdout);
        assert.ok(match?.[1], result.stdout);
        const pids = match[1].split(",").map((value) => Number(value));
        const deadline = Date.now() + 8_000;
        for (const pid of pids) {
          while (isAlive(pid) && Date.now() < deadline) {
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
          assert.equal(isAlive(pid), false, `supervisor pid ${String(pid)} still alive`);
        }
      } finally {
        await rm(fixtureDir, { recursive: true, force: true });
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
            for await (const _update of executor.run(["echo", "hi"], {
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
