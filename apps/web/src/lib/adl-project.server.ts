import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ADL_FRAMEWORK_DEV_ENV,
  ADL_PROJECT_ROOT_ENV,
  ADL_PROJECT_WATCH_ENV,
  acquireAdlProject,
  ensureAdlProjectFileWatch,
  findAdlProjectRootFromCwd,
  requestAdlProjectReload,
  setAdlProjectWatchListeners,
  type LoadedAdlProject,
} from "@agent-dev-lab/core/project";

import {
  ensureInspectorAgentObserver,
  resetInspectorAgentObserver,
} from "#/lib/inspector/inspector-agent-observer.server";

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

function shouldWatchProject(): boolean {
  // Vite's adl-project-reload plugin owns watching in framework / dashboard dev.
  if (process.env.ADL_VITE_PROJECT_WATCH === "1") {
    return false;
  }
  return process.env.ADL_INSPECTOR_SERVE !== "1";
}

// Prompt / template caches honor this even when Vite (not fs.watch) drives reload.
if (process.env.ADL_INSPECTOR_SERVE !== "1") {
  process.env[ADL_PROJECT_WATCH_ENV] = "1";
}

function bindInspectorWatchListeners(project: LoadedAdlProject): void {
  setAdlProjectWatchListeners({
    onReload: () => {
      // jiti reload builds a new runtime with empty observer arrays; attach again.
      resetInspectorAgentObserver();
      try {
        void ensureInspectorAgentObserver(project.getAdl(), project).catch(() => {
          // Missing `adl` on the reloaded config — catalog loaders will surface it.
        });
      } catch {
        // getAdl() throws when config.adl is missing.
      }
    },
  });
}

export async function getLoadedAdlProject(): Promise<LoadedAdlProject> {
  const root = resolveAdlProjectRoot();
  const project = await acquireAdlProject(root);
  bindInspectorWatchListeners(project);
  ensureAdlProjectFileWatch(shouldWatchProject());
  try {
    await ensureInspectorAgentObserver(project.getAdl(), project);
  } catch {
    // getAdl() throws when config.adl is missing; catalog loaders surface that.
  }
  return project;
}

/**
 * Dev-only entry for the Vite plugin's Nitro `dispatchFetch` into
 * `/api/project/reload` — runs in the same worker isolate as other `/api/*`
 * handlers so the registry that executes workflows is the one that reloads.
 */
export async function reloadAdlProjectForViteWatcher(triggerPath?: string): Promise<{
  generation: number;
  lastReloadError: string | null;
}> {
  await getLoadedAdlProject();
  return requestAdlProjectReload(triggerPath);
}
