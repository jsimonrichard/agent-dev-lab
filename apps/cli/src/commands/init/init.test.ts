import { existsSync } from "node:fs";
import { mkdtemp, readFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "bun:test";

import { loadAdlProject } from "@agent-dev-lab/core";

import { buildContext } from "../../context";
import { adlMonorepoRootFromCli, isAdlCliSourceCheckout, sourceScaffoldRoot } from "../../paths";
import { findMonorepoRoot } from "../../resolve-packages";
import { initCommandFlags } from "./command";
import init from "./impl";
import { listScaffoldSourceFiles } from "./scaffold-files";
import {
  assertLocalInitAllowed,
  buildInitGitignore,
  buildInitPackageJson,
  rewriteScaffoldConfigName,
} from "./scaffold";

const LOCAL_FROM = /from\s+["'](\.[^"']+)["']/g;

function localSpecifiers(source: string): string[] {
  return [...source.matchAll(LOCAL_FROM)].map((match) => match[1]!);
}

function resolveExisting(fromFile: string, spec: string): string | undefined {
  const base = path.resolve(path.dirname(fromFile), spec);
  const candidates = [base, `${base}.ts`, path.join(base, "index.ts")];
  return candidates.find((candidate) => existsSync(candidate));
}

describe("adl init", () => {
  it("scaffolds a self-contained project from the dedicated scaffold", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "adl-init-"));
    const ctx = buildContext(process);
    await init.call(ctx, { local: false }, dir);

    const name = path.basename(dir);
    const scaffold = sourceScaffoldRoot();

    for (const relative of listScaffoldSourceFiles(scaffold)) {
      const actual = await readFile(path.join(dir, relative), "utf8");
      const expected = await readFile(path.join(scaffold, relative), "utf8");
      if (relative === "adl.config.ts") {
        expect(actual).toBe(rewriteScaffoldConfigName(expected, name));
      } else if (relative === "README.md") {
        expect(actual).toBe(expected.replaceAll("{{DISPLAY_NAME}}", name));
      } else {
        expect(actual).toBe(expected);
      }
    }

    const generatedTs = [
      "adl.config.ts",
      "src/adl.ts",
      "src/model.ts",
      "src/agents/assistant.ts",
      "src/workflows/demo-counter.ts",
      "src/workflows/ask.ts",
    ];
    for (const relative of generatedTs) {
      const fullPath = path.join(dir, relative);
      const source = await readFile(fullPath, "utf8");
      for (const spec of localSpecifiers(source)) {
        expect(resolveExisting(fullPath, spec)).toBeTruthy();
      }
    }

    const pkg = JSON.parse(await readFile(path.join(dir, "package.json"), "utf8")) as {
      dependencies: Record<string, string>;
      imports?: Record<string, string>;
      scripts?: Record<string, string>;
    };
    expect(pkg.dependencies["@agent-dev-lab/cli"]).toBe("^0.0.0");
    expect(pkg.dependencies["@agent-dev-lab/core"]).toBe("^0.0.0");
    expect(pkg.dependencies["@agent-dev-lab/web"]).toBe("^0.0.0");
    expect(pkg.scripts?.dev).toBe("bun --bun adl dashboard");
    expect(pkg.scripts?.dashboard).toBe("bun --bun adl dashboard");
    expect(pkg.imports?.["#adl"]).toBe("./src/adl.ts");
    expect(await readFile(path.join(dir, ".gitignore"), "utf8")).toContain("node_modules/");
    expect(await readFile(path.join(dir, ".env.example"), "utf8")).toContain("OPENAI_API_KEY");
    expect(await readFile(path.join(dir, "tsconfig.json"), "utf8")).toContain('"#adl"');
    expect(await readFile(path.join(dir, "README.md"), "utf8")).toContain(`# ${name}`);
  });

  it("pins generated dependencies to this checkout with --local", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "adl-init-local-"));
    const ctx = buildContext(process);
    await init.call(ctx, { local: true }, dir);

    const localRoot = adlMonorepoRootFromCli();
    const pkg = JSON.parse(await readFile(path.join(dir, "package.json"), "utf8")) as {
      dependencies: Record<string, string>;
      overrides: Record<string, string>;
    };
    expect(pkg.dependencies["@agent-dev-lab/core"]).toBe(
      `file:${path.join(localRoot, "packages/core")}`,
    );
    expect(pkg.overrides["@agent-dev-lab/web"]).toBe(`file:${path.join(localRoot, "apps/web")}`);
    expect(await readFile(path.join(dir, "bunfig.toml"), "utf8")).toContain('linker = "hoisted"');
  });

  it(
    "typechecks the generated tree and runs demo-counter",
    async () => {
      const dir = await mkdtemp(path.join(tmpdir(), "adl-init-"));
      const ctx = buildContext(process);
      await init.call(ctx, { local: false }, dir);

      const monorepoRoot = findMonorepoRoot(import.meta.dir);
      expect(monorepoRoot).toBeTruthy();
      // Playground is a workspace ADL project with the same runtime deps as the
      // scaffold (`core`, `@ai-sdk/openai`, `zod`, `typescript`). Bun's isolated
      // linker does not hoist those to the repo-root node_modules.
      const playgroundModules = path.join(monorepoRoot!, "apps/playground/node_modules");
      expect(existsSync(playgroundModules)).toBe(true);
      await symlink(playgroundModules, path.join(dir, "node_modules"), "dir");

      const typecheck = Bun.spawn(["bun", "run", "typecheck"], {
        cwd: dir,
        stdout: "pipe",
        stderr: "pipe",
      });
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(typecheck.stdout).text(),
        new Response(typecheck.stderr).text(),
        typecheck.exited,
      ]);
      if (exitCode !== 0) {
        throw new Error(`typecheck failed:\n${stdout}\n${stderr}`);
      }

      const project = await loadAdlProject({ root: dir });
      expect(project.listWorkflowIds().sort()).toEqual(["ask", "demo-counter"]);
      expect(project.listAgentIds()).toEqual(["assistant"]);

      const workflow = project.getWorkflow("demo-counter");
      expect(workflow).toBeTruthy();
      await expect(workflow!.run({ steps: 3 }).result).resolves.toEqual({ sum: 6, steps: 3 });
    },
    { timeout: 60_000 },
  );
});

const SCAFFOLD_PKG = {
  scripts: {
    dev: "bun --bun adl dashboard",
    dashboard: "bun --bun adl dashboard",
    typecheck: "tsc --noEmit",
  },
  dependencies: { "@ai-sdk/openai": "^2.0.42", zod: "^3.25.76" },
  devDependencies: { "@types/bun": "^1.3.13", typescript: "^6.0.2" },
};

describe("init scaffold helpers", () => {
  it("substitutes the scaffold project name", () => {
    expect(
      rewriteScaffoldConfigName(`export default {\n  name: "adl-scaffold",\n};\n`, "demo"),
    ).toBe(`export default {\n  name: "demo",\n};\n`);
  });

  it("adds node_modules to the scaffold gitignore", () => {
    expect(buildInitGitignore(".adl/\n.data/\n")).toBe("node_modules/\n.adl/\n.data/\n");
  });

  it("pins the inspection UI with the CLI and core", () => {
    const pkg = JSON.parse(buildInitPackageJson("demo", SCAFFOLD_PKG)) as {
      dependencies: Record<string, string>;
      overrides?: unknown;
    };
    expect(pkg.dependencies["@agent-dev-lab/cli"]).toBe("^0.0.0");
    expect(pkg.dependencies["@agent-dev-lab/core"]).toBe("^0.0.0");
    expect(pkg.dependencies["@agent-dev-lab/web"]).toBe("^0.0.0");
    expect(pkg.dependencies["@agent-dev-lab/common"]).toBeUndefined();
    expect(pkg.overrides).toBeUndefined();
  });

  it("rewrites @agent-dev-lab packages to file: + overrides for --local", () => {
    const localRoot = adlMonorepoRootFromCli();
    const pkg = JSON.parse(buildInitPackageJson("demo", SCAFFOLD_PKG, { localRoot })) as {
      dependencies: Record<string, string>;
      overrides: Record<string, string>;
    };
    const coreSpec = `file:${path.join(localRoot, "packages/core")}`;
    expect(pkg.dependencies["@agent-dev-lab/core"]).toBe(coreSpec);
    expect(pkg.dependencies["@agent-dev-lab/cli"]).toBe(`file:${path.join(localRoot, "apps/cli")}`);
    expect(pkg.dependencies["@agent-dev-lab/web"]).toBe(`file:${path.join(localRoot, "apps/web")}`);
    expect(pkg.dependencies["@agent-dev-lab/common"]).toBe(
      `file:${path.join(localRoot, "packages/common")}`,
    );
    expect(pkg.overrides["@agent-dev-lab/core"]).toBe(coreSpec);
    expect(pkg.overrides["@agent-dev-lab/common"]).toBe(
      `file:${path.join(localRoot, "packages/common")}`,
    );
  });

  it("rejects --local outside the source checkout", () => {
    expect(() => assertLocalInitAllowed(false)).toThrow(/source checkout/);
  });

  it("hides --local in published CLI help and shows it from this checkout", () => {
    expect(isAdlCliSourceCheckout()).toBe(true);
    expect(initCommandFlags(true).local.hidden).toBe(false);
    expect(initCommandFlags(false).local.hidden).toBe(true);
  });

  it("prints --local in source-checkout init help", async () => {
    const cliRoot = path.resolve(adlMonorepoRootFromCli(), "apps/cli");
    const proc = Bun.spawn(["bun", "run", "src/bin/cli.ts", "init", "--help"], {
      cwd: cliRoot,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    expect(exitCode).toBe(0);
    expect(`${stdout}\n${stderr}`).toContain("--local");
  });
});
