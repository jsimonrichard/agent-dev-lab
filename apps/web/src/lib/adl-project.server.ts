import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ADL_FRAMEWORK_DEV_ENV,
  ADL_PROJECT_ROOT_ENV,
  ADL_PROJECT_WATCH_ENV,
  acquireAdlProject,
  ensureAdlProjectFileWatch,
  findAdlProjectRootFromCwd,
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

/**
 * Watch in every dev mode; only `adl dashboard --serve` opts out, and it has nothing to watch
 * with anyway (it runs the built Nitro `.output` under Node, with no dev server).
 */
function shouldWatchProject(): boolean {
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
  await ensureAdlProjectFileWatch(shouldWatchProject());
  try {
    await ensureInspectorAgentObserver(project.getAdl(), project);
  } catch {
    // getAdl() throws when config.adl is missing; catalog loaders surface that.
  }
  return project;
}
