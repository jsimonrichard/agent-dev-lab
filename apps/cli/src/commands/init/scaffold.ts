import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { AdlError } from "@agent-dev-lab/core";

import { cliPackageRoot } from "../../paths";

export { listScaffoldSourceFiles, SCAFFOLD_PACKAGED_FILES } from "./scaffold-files";

const SCAFFOLD_NAME = "adl-scaffold";

export function rewriteScaffoldConfigName(source: string, projectName: string): string {
  const pattern = new RegExp(`name:\\s*"${SCAFFOLD_NAME}"`);
  if (!pattern.test(source)) {
    throw new AdlError(
      "INIT_FAILED",
      `Scaffold adl.config.ts must contain \`name: "${SCAFFOLD_NAME}"\` so init can substitute the project name.`,
    );
  }
  return source.replace(pattern, `name: ${JSON.stringify(projectName)}`);
}

export function buildInitGitignore(scaffoldGitignore: string): string {
  const hasNodeModules = scaffoldGitignore.split(/\r?\n/).some((line) => {
    const trimmed = line.trim();
    return trimmed === "node_modules" || trimmed === "node_modules/";
  });
  const body = scaffoldGitignore.endsWith("\n") ? scaffoldGitignore : `${scaffoldGitignore}\n`;
  return hasNodeModules ? body : `node_modules/\n${body}`;
}

interface ScaffoldPackageJson {
  imports?: Record<string, string>;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

function requireDep(
  deps: Record<string, string> | undefined,
  name: string,
  source: string,
): string {
  const version = deps?.[name];
  if (!version || version === "workspace:*") {
    throw new AdlError(
      "INIT_FAILED",
      `Scaffold ${source} is missing a publishable version for "${name}".`,
    );
  }
  return version;
}

function requireScripts(scripts: Record<string, string> | undefined): Record<string, string> {
  if (!scripts) {
    throw new AdlError("INIT_FAILED", 'Scaffold package.json is missing a "scripts" field.');
  }
  for (const name of ["dev", "dashboard", "typecheck"] as const) {
    if (!scripts[name]) {
      throw new AdlError("INIT_FAILED", `Scaffold package.json is missing the "${name}" script.`);
    }
  }
  return scripts;
}

/** Workspace packages rewritten to `file:` when `adl init --local` runs from this checkout. */
export const INIT_LOCAL_PACKAGES = [
  { name: "@agent-dev-lab/cli", rel: "apps/cli" },
  { name: "@agent-dev-lab/core", rel: "packages/core" },
  { name: "@agent-dev-lab/web", rel: "apps/web" },
] as const;

export function assertLocalInitAllowed(isSourceCheckout: boolean): void {
  if (!isSourceCheckout) {
    throw new AdlError(
      "INIT_FAILED",
      "--local is only available when running the CLI from the Agent Dev Lab source checkout.",
    );
  }
}

export function localFileSpecs(localRoot: string): Record<string, string> {
  const specs: Record<string, string> = {};
  for (const pkg of INIT_LOCAL_PACKAGES) {
    const dir = path.resolve(localRoot, pkg.rel);
    const pkgJsonPath = path.join(dir, "package.json");
    if (!existsSync(pkgJsonPath)) {
      throw new AdlError("INIT_FAILED", `Expected ${pkg.name} at ${dir} for --local.`);
    }
    const name = (JSON.parse(readFileSync(pkgJsonPath, "utf8")) as { name?: string }).name;
    if (name !== pkg.name) {
      throw new AdlError(
        "INIT_FAILED",
        `Expected package name "${pkg.name}" at ${dir}, found ${JSON.stringify(name)}.`,
      );
    }
    specs[pkg.name] = `file:${dir}`;
  }
  return specs;
}

export function buildInitPackageJson(
  projectName: string,
  scaffoldPkg: ScaffoldPackageJson,
  options?: { localRoot?: string },
): string {
  const cliPkg = JSON.parse(readFileSync(path.join(cliPackageRoot(), "package.json"), "utf8")) as {
    version: string;
  };
  const version = `^${cliPkg.version}`;
  const localSpecs = options?.localRoot ? localFileSpecs(options.localRoot) : undefined;
  const adlDep = (name: "cli" | "core" | "web"): string =>
    localSpecs?.[`@agent-dev-lab/${name}`] ?? version;

  const pkg = {
    name: projectName,
    private: true,
    type: "module",
    imports: scaffoldPkg.imports ?? { "#adl": "./src/adl.ts" },
    scripts: requireScripts(scaffoldPkg.scripts),
    dependencies: {
      "@agent-dev-lab/cli": adlDep("cli"),
      "@agent-dev-lab/core": adlDep("core"),
      "@agent-dev-lab/web": adlDep("web"),
      "@ai-sdk/openai": requireDep(scaffoldPkg.dependencies, "@ai-sdk/openai", "package.json"),
      zod: requireDep(scaffoldPkg.dependencies, "zod", "package.json"),
    },
    devDependencies: {
      "@types/bun": requireDep(scaffoldPkg.devDependencies, "@types/bun", "package.json"),
      typescript: requireDep(scaffoldPkg.devDependencies, "typescript", "package.json"),
    },
    ...(localSpecs ? { overrides: localSpecs } : {}),
  };

  return `${JSON.stringify(pkg, null, 2)}\n`;
}

export function readScaffoldPackageJson(scaffoldRoot: string): ScaffoldPackageJson {
  return JSON.parse(
    readFileSync(path.join(scaffoldRoot, "package.json"), "utf8"),
  ) as ScaffoldPackageJson;
}
