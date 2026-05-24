import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ADL_FRAMEWORK_DEV_ENV,
  ADL_PROJECT_ROOT_ENV,
  findAdlProjectRootFromCwd,
  loadAdlProject,
  type LoadedAdlProject,
} from "@agent-dev-lab/runtime/project";

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

export async function getLoadedAdlProject(): Promise<LoadedAdlProject> {
  if (!cached) {
    cached = await loadAdlProject({ root: resolveAdlProjectRoot() });
  }
  return cached;
}
