import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "bun:test";

import { findMonorepoRoot } from "../resolve-packages";
import { allocatePort, runCommand, waitUntil } from "./harness";
import { buildContext } from "../context";
import init from "../commands/init/impl";

const SETUP_TIMEOUT_MS = 300_000;

const PACKAGES = [
  { name: "@agent-dev-lab/common", dir: "packages/common" },
  { name: "@agent-dev-lab/core", dir: "packages/core" },
  { name: "@agent-dev-lab/web", dir: "apps/web" },
  { name: "@agent-dev-lab/cli", dir: "apps/cli" },
] as const;

/**
 * Published-path smoke: build + npm pack the four packages, `adl init` without
 * `--local`, install from tarballs, typecheck, and run demo-counter.
 */
describe("adl init packed e2e", () => {
  let projectRoot: string | undefined;
  let packDir: string | undefined;
  let monorepoRoot: string;

  beforeAll(async () => {
    const root = findMonorepoRoot(import.meta.dir);
    if (!root) {
      throw new Error("could not find monorepo root for packed init e2e");
    }
    monorepoRoot = root;
    packDir = await mkdtemp(path.join(tmpdir(), "adl-pack-"));

    // Ensure publishable artifacts exist (web .output is required for CLI pack).
    const build = await runCommand(["bun", "run", "build"], {
      cwd: monorepoRoot,
      timeoutMs: 240_000,
    });
    if (build.exitCode !== 0) {
      throw new Error(`bun run build failed:\n${build.stdout}\n${build.stderr}`);
    }

    const tarballByName: Record<string, string> = {};
    for (const pkg of PACKAGES) {
      const pack = await runCommand(["npm", "pack", "--pack-destination", packDir], {
        cwd: path.join(monorepoRoot, pkg.dir),
        timeoutMs: 120_000,
      });
      if (pack.exitCode !== 0) {
        throw new Error(`npm pack ${pkg.name} failed:\n${pack.stdout}\n${pack.stderr}`);
      }
      const tarballName = pack.stdout.trim().split(/\s+/).at(-1);
      if (!tarballName?.endsWith(".tgz")) {
        throw new Error(`npm pack ${pkg.name} did not print a tarball name:\n${pack.stdout}`);
      }
      tarballByName[pkg.name] = path.join(packDir, tarballName);
    }

    projectRoot = await mkdtemp(path.join(tmpdir(), "adl-init-pack-"));
    await init.call(buildContext(process), { local: false }, projectRoot);

    const pkgPath = path.join(projectRoot, "package.json");
    const pkg = JSON.parse(await readFile(pkgPath, "utf8")) as {
      dependencies: Record<string, string>;
      overrides?: Record<string, string>;
    };
    for (const [name, tarball] of Object.entries(tarballByName)) {
      if (pkg.dependencies[name] !== undefined) {
        pkg.dependencies[name] = tarball;
      }
    }
    pkg.overrides = { ...pkg.overrides, ...tarballByName };
    await writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

    const install = await runCommand(["bun", "install"], {
      cwd: projectRoot,
      timeoutMs: 180_000,
    });
    if (install.exitCode !== 0) {
      throw new Error(`bun install (packed) failed:\n${install.stdout}\n${install.stderr}`);
    }
  }, SETUP_TIMEOUT_MS);

  afterAll(async () => {
    if (projectRoot) {
      await rm(projectRoot, { recursive: true, force: true }).catch(() => undefined);
    }
    if (packDir) {
      await rm(packDir, { recursive: true, force: true }).catch(() => undefined);
    }
  });

  it(
    "typechecks and runs demo-counter with the packed CLI",
    async () => {
      if (!projectRoot) {
        throw new Error("packed init project was not created");
      }

      const typecheck = await runCommand(["bun", "run", "typecheck"], {
        cwd: projectRoot,
        timeoutMs: 60_000,
      });
      if (typecheck.exitCode !== 0) {
        throw new Error(`typecheck failed:\n${typecheck.stdout}\n${typecheck.stderr}`);
      }

      const packedCli = path.join(
        projectRoot,
        "node_modules",
        "@agent-dev-lab",
        "cli",
        "dist",
        "cli.js",
      );

      const run = await runCommand(
        [process.execPath, packedCli, "workflow", "run", "demo-counter", "--input", '{"steps":3}'],
        { cwd: projectRoot, timeoutMs: 60_000 },
      );
      expect(run.exitCode).toBe(0);
      expect(run.stdout).toContain('"sum": 6');
      expect(run.stdout).toContain('"steps": 3');

      // Prefer the packed binary over the source checkout CLI.
      const list = await runCommand([process.execPath, packedCli, "workflow", "list"], {
        cwd: projectRoot,
        timeoutMs: 30_000,
      });
      expect(list.exitCode).toBe(0);
      expect(list.stdout).toContain("demo-counter");
    },
    { timeout: 120_000 },
  );

  it(
    "serves GET /api/project from the packed dashboard",
    async () => {
      if (!projectRoot) {
        throw new Error("packed init project was not created");
      }
      const packedCli = path.join(
        projectRoot,
        "node_modules",
        "@agent-dev-lab",
        "cli",
        "dist",
        "cli.js",
      );
      const port = await allocatePort();
      const child = Bun.spawn(
        [process.execPath, packedCli, "dashboard", "--serve", "--port", String(port)],
        {
          cwd: projectRoot,
          env: { ...process.env, PORT: String(port), BROWSER: "none", NO_COLOR: "1" },
          stdout: "pipe",
          stderr: "pipe",
        },
      );

      try {
        await waitUntil(
          async () => {
            try {
              const res = await fetch(`http://127.0.0.1:${port}/api/project`);
              return res.ok;
            } catch {
              return false;
            }
          },
          60_000,
          () => "packed dashboard did not become ready",
        );
        const res = await fetch(`http://127.0.0.1:${port}/api/project`);
        expect(res.status).toBe(200);
        const body = (await res.json()) as { config: { workflowIds: string[] } };
        expect(body.config.workflowIds).toContain("demo-counter");
      } finally {
        child.kill();
        await child.exited;
      }
    },
    { timeout: 120_000 },
  );
});
