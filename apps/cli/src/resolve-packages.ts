import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

/** Directory containing this module (`src/` in dev, `dist/` when built). */
const moduleDir = path.dirname(fileURLToPath(import.meta.url));

function readPackageJson(dir: string): { name?: string; workspaces?: unknown } | null {
  const pkgPath = path.join(dir, "package.json");
  if (!existsSync(pkgPath)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(pkgPath, "utf8")) as { name?: string; workspaces?: unknown };
  } catch {
    return null;
  }
}

/** Walk upward from `startDir` looking for a root `package.json` with `workspaces`. */
export function findMonorepoRoot(startDir: string): string | null {
  let dir = path.resolve(startDir);
  const fsRoot = path.parse(dir).root;

  while (true) {
    const pkg = readPackageJson(dir);
    if (pkg?.workspaces) {
      return dir;
    }
    if (dir === fsRoot) {
      return null;
    }
    dir = path.dirname(dir);
  }
}

function workspaceLayoutPath(monorepoRoot: string, packageName: string): string | null {
  const shortName = packageName.replace(/^@agent-dev-lab\//, "");
  const candidates = [
    path.join(monorepoRoot, "apps", shortName),
    path.join(monorepoRoot, "packages", shortName),
  ];

  for (const dir of candidates) {
    const pkg = readPackageJson(dir);
    if (pkg?.name === packageName) {
      return dir;
    }
  }
  return null;
}

/**
 * Resolve an ADL workspace package to its root directory.
 * Uses Node module resolution from the CLI install location first, then falls back
 * to monorepo layout discovery so `adl` works when invoked from any subdirectory.
 */
export function resolveWorkspacePackageRoot(packageName: string): string {
  try {
    const pkgJsonPath = require.resolve(`${packageName}/package.json`);
    return path.dirname(pkgJsonPath);
  } catch {
    // Fall through to monorepo layout lookup.
  }

  const monorepoRoot = findMonorepoRoot(moduleDir) ?? findMonorepoRoot(process.cwd());

  if (monorepoRoot) {
    const layoutPath = workspaceLayoutPath(monorepoRoot, packageName);
    if (layoutPath) {
      return layoutPath;
    }
  }

  throw new Error(
    `Could not resolve ${packageName}. Install the agent-dev-lab workspace or run \`bun install\` from the monorepo root.`,
  );
}

export function resolveDefaultProjectRoot(): string {
  try {
    return resolveWorkspacePackageRoot("@agent-dev-lab/playground");
  } catch {
    return process.cwd();
  }
}
