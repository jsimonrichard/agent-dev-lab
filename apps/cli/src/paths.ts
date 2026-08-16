import { existsSync } from "node:fs";
import path from "node:path";

import { resolveWorkspacePackageRoot } from "./resolve-packages";

export function cliPackageRoot(): string {
  return resolveWorkspacePackageRoot("@agent-dev-lab/cli");
}

export function webPackageRoot(): string {
  return resolveWorkspacePackageRoot("@agent-dev-lab/web");
}

export function playgroundPackageRoot(): string {
  return resolveWorkspacePackageRoot("@agent-dev-lab/playground");
}

export function webOutputRoot(): string {
  return path.join(webPackageRoot(), ".output");
}

/** Playground project files copied into published CLI builds. */
export function packagedScaffoldRoot(): string {
  return path.join(cliPackageRoot(), "dist", "scaffold");
}

/**
 * Source of `adl init` project files: live playground in the monorepo, otherwise
 * the copy packaged next to the CLI.
 */
export function initScaffoldRoot(): string {
  try {
    const playground = playgroundPackageRoot();
    if (existsSync(path.join(playground, "adl.config.ts"))) {
      return playground;
    }
  } catch {
    // Published installs do not include the private playground package.
  }

  const packaged = packagedScaffoldRoot();
  if (existsSync(path.join(packaged, "adl.config.ts"))) {
    return packaged;
  }

  throw new Error(
    "Could not find the init scaffold. Run from the monorepo, or rebuild the CLI so dist/scaffold is included.",
  );
}
