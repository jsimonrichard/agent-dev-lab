import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ADL_PROJECT_ROOT_ENV,
  loadAdlProject,
  type LoadedAdlProject,
} from "@agent-dev-lab/runtime/project";

const webPackageRoot = path.dirname(fileURLToPath(new URL("../../", import.meta.url)));

/** Default monorepo dev target when `ADL_PROJECT_ROOT` is unset. */
export function defaultMonorepoProjectRoot(): string {
  return path.resolve(webPackageRoot, "../playground");
}

export function resolveAdlProjectRoot(): string {
  return process.env[ADL_PROJECT_ROOT_ENV] ?? defaultMonorepoProjectRoot();
}

let cached: LoadedAdlProject | undefined;

export async function getLoadedAdlProject(): Promise<LoadedAdlProject> {
  if (!cached) {
    cached = await loadAdlProject({ root: resolveAdlProjectRoot() });
  }
  return cached;
}
