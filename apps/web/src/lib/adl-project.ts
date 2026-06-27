import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  ADL_FRAMEWORK_DEV_ENV,
  ADL_PROJECT_ROOT_ENV,
  findAdlProjectRootFromCwd,
  loadAdlProject,
  type LoadedAdlProject,
} from "@agent-dev-lab/core/project";

const webPackageRoot = path.dirname(fileURLToPath(new URL("../../", import.meta.url)));

function frameworkPlaygroundRoot(): string {
  return path.resolve(webPackageRoot, "../playground");
}

function resolveAdlProjectRoot(): string {
  if (process.env[ADL_PROJECT_ROOT_ENV]) {
    return process.env[ADL_PROJECT_ROOT_ENV]!;
  }
  if (process.env[ADL_FRAMEWORK_DEV_ENV] === "1") {
    return frameworkPlaygroundRoot();
  }
  return findAdlProjectRootFromCwd(process.cwd());
}

let cached: LoadedAdlProject | undefined;

async function ensureProjectEnv(root: string): Promise<void> {
  const envModule = path.join(root, "src/env.ts");
  if (existsSync(envModule)) {
    await import(pathToFileURL(envModule).href);
  }
}

export async function getLoadedAdlProject(): Promise<LoadedAdlProject> {
  if (!cached) {
    const root = resolveAdlProjectRoot();
    await ensureProjectEnv(root);
    cached = await loadAdlProject({ root });
  }
  return cached;
}

/** Process runtime from the loaded project config (`config.adl`). */
export async function getAdlRuntime() {
  const project = await getLoadedAdlProject();
  return project.getAdl();
}
