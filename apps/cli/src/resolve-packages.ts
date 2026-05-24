import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";

const cliRequire = createRequire(import.meta.url);

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
 * Resolve a package from a project directory by walking up the tree.
 * Uses each ancestor's node_modules (supports hoisted installs).
 */
export function resolveFromProjectRoot(projectRoot: string, specifier: string): string {
  let dir = path.resolve(projectRoot);
  const fsRoot = path.parse(dir).root;

  while (true) {
    const pkgJsonPath = path.join(dir, "package.json");
    if (existsSync(pkgJsonPath)) {
      try {
        const projectRequire = createRequire(pkgJsonPath);
        return projectRequire.resolve(specifier);
      } catch {
        // Not installed at this level — try parent directory.
      }
    }

    if (dir === fsRoot) {
      break;
    }
    dir = path.dirname(dir);
  }

  throw new Error(
    `Could not resolve ${specifier} from ${projectRoot}. Add it to your project dependencies and install.`,
  );
}

/**
 * Resolve an ADL monorepo workspace package (web, playground, cli internals).
 * Anchored to the CLI install location, not the user's project cwd.
 */
export function resolveWorkspacePackageRoot(packageName: string): string {
  try {
    const pkgJsonPath = cliRequire.resolve(`${packageName}/package.json`);
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

export interface ProjectRuntimeProjectModule {
  ADL_PROJECT_ROOT_ENV: string;
  findAdlProjectRootFromCwd: (cwd?: string) => string;
  loadAdlProject: (options?: { root?: string; cwd?: string }) => Promise<{
    root: string;
    configPath: string;
    config: { name: string };
  }>;
}

/** Load `@agent-dev-lab/runtime/project` from the target project's dependency tree. */
export async function importProjectRuntimeProject(
  projectRoot: string,
): Promise<ProjectRuntimeProjectModule> {
  const entry = resolveFromProjectRoot(projectRoot, "@agent-dev-lab/runtime/project");
  return import(pathToFileURL(entry).href) as Promise<ProjectRuntimeProjectModule>;
}
