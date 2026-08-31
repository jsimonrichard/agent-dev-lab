import { existsSync } from "node:fs";
import path from "node:path";

import { resolveWorkspacePackageRoot } from "./resolve-packages";

export function cliPackageRoot(): string {
  return resolveWorkspacePackageRoot("@agent-dev-lab/cli");
}

/** Monorepo root when this CLI is `apps/cli` in the Agent Dev Lab checkout. */
export function adlMonorepoRootFromCli(): string {
  return path.resolve(cliPackageRoot(), "../..");
}

/**
 * True when this process is the framework checkout (`apps/cli` with source +
 * sibling packages), not a published `node_modules/@agent-dev-lab/cli` install.
 */
export function isAdlCliSourceCheckout(): boolean {
  const cliRoot = cliPackageRoot();
  const repoRoot = adlMonorepoRootFromCli();
  return (
    path.basename(cliRoot) === "cli" &&
    path.basename(path.dirname(cliRoot)) === "apps" &&
    existsSync(path.join(cliRoot, "src/bin/cli.ts")) &&
    existsSync(path.join(cliRoot, "scaffold/adl.config.ts")) &&
    existsSync(path.join(repoRoot, "packages/core/package.json")) &&
    existsSync(path.join(repoRoot, "apps/web/package.json"))
  );
}

export function webPackageRoot(): string {
  return resolveWorkspacePackageRoot("@agent-dev-lab/web");
}

export function webOutputRoot(): string {
  return path.join(webPackageRoot(), ".output");
}

/** Dedicated `adl init` project files copied into published CLI builds. */
export function packagedScaffoldRoot(): string {
  return path.join(cliPackageRoot(), "dist", "scaffold");
}

export function sourceScaffoldRoot(): string {
  return path.join(cliPackageRoot(), "scaffold");
}

/**
 * Source of `adl init` project files: live `apps/cli/scaffold` in the monorepo,
 * otherwise the copy packaged next to the CLI.
 */
export function initScaffoldRoot(): string {
  const source = sourceScaffoldRoot();
  if (existsSync(path.join(source, "adl.config.ts"))) {
    return source;
  }

  const packaged = packagedScaffoldRoot();
  if (existsSync(path.join(packaged, "adl.config.ts"))) {
    return packaged;
  }

  throw new Error(
    "Could not find the init scaffold. Run from the monorepo, or rebuild the CLI so dist/scaffold is included.",
  );
}
