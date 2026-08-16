import { readFileSync } from "node:fs";
import path from "node:path";

import { AdlError } from "@agent-dev-lab/core";

import { cliPackageRoot } from "../../paths";

export { PLAYGROUND_SOURCE_FILES } from "./scaffold-files";

export function rewritePlaygroundConfigName(source: string, projectName: string): string {
  if (!/name:\s*"playground"/.test(source)) {
    throw new AdlError(
      "INIT_FAILED",
      'Playground adl.config.ts must contain `name: "playground"` so init can substitute the project name.',
    );
  }
  return source.replace(/name:\s*"playground"/, `name: ${JSON.stringify(projectName)}`);
}

export function buildInitGitignore(playgroundGitignore: string): string {
  const hasNodeModules = playgroundGitignore.split(/\r?\n/).some((line) => {
    const trimmed = line.trim();
    return trimmed === "node_modules" || trimmed === "node_modules/";
  });
  const body = playgroundGitignore.endsWith("\n")
    ? playgroundGitignore
    : `${playgroundGitignore}\n`;
  return hasNodeModules ? body : `node_modules/\n${body}`;
}

interface PlaygroundPackageJson {
  imports?: Record<string, string>;
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
      `Playground ${source} is missing a publishable version for "${name}".`,
    );
  }
  return version;
}

export function buildInitPackageJson(
  projectName: string,
  playgroundPkg: PlaygroundPackageJson,
): string {
  const cliPkg = JSON.parse(readFileSync(path.join(cliPackageRoot(), "package.json"), "utf8")) as {
    version: string;
  };
  const version = `^${cliPkg.version}`;

  const pkg = {
    name: projectName,
    private: true,
    type: "module",
    imports: playgroundPkg.imports ?? { "#adl": "./src/adl.ts" },
    scripts: {
      dev: "adl dev",
      typecheck: "tsc --noEmit",
    },
    dependencies: {
      "@agent-dev-lab/cli": version,
      "@agent-dev-lab/core": version,
      "@ai-sdk/openai": requireDep(playgroundPkg.dependencies, "@ai-sdk/openai", "package.json"),
      zod: requireDep(playgroundPkg.dependencies, "zod", "package.json"),
    },
    devDependencies: {
      "@types/bun": requireDep(playgroundPkg.devDependencies, "@types/bun", "package.json"),
      typescript: requireDep(playgroundPkg.devDependencies, "typescript", "package.json"),
    },
  };

  return `${JSON.stringify(pkg, null, 2)}\n`;
}

export function readPlaygroundPackageJson(scaffoldRoot: string): PlaygroundPackageJson {
  return JSON.parse(
    readFileSync(path.join(scaffoldRoot, "package.json"), "utf8"),
  ) as PlaygroundPackageJson;
}
