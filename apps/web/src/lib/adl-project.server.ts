import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  ADL_FRAMEWORK_DEV_ENV,
  ADL_PROJECT_ROOT_ENV,
  ADL_PROJECT_WATCH_ENV,
  findAdlProjectRootFromCwd,
  loadAdlProject,
  watchAdlProject,
  type LoadedAdlProject,
} from "@agent-dev-lab/core/project";

import {
  resetInspectorAgentObserver,
  ensureInspectorAgentObserver,
} from "#/lib/inspector-agent-observer.server";
import { emitProjectReload } from "#/lib/project-reload-events.server";

const webPackageRoot = path.dirname(fileURLToPath(new URL("../../", import.meta.url)));

type AdlProjectHostGlobal = {
  __adlLoadedProject?: LoadedAdlProject;
  __adlProjectWatchDispose?: () => void;
  __adlWatchedProjectRoot?: string;
};

const host = globalThis as AdlProjectHostGlobal;

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
  return process.env.ADL_INSPECTOR_SERVE !== "1";
}

if (shouldWatchProject()) {
  process.env[ADL_PROJECT_WATCH_ENV] = "1";
}

async function ensureProjectEnv(root: string): Promise<void> {
  const envModule = path.join(root, "src/env.ts");
  if (existsSync(envModule)) {
    await import(/* @vite-ignore */ pathToFileURL(envModule).href);
  }
}

function ensureProjectWatch(project: LoadedAdlProject): void {
  if (!shouldWatchProject()) {
    return;
  }

  if (host.__adlWatchedProjectRoot === project.root && host.__adlProjectWatchDispose) {
    return;
  }

  host.__adlProjectWatchDispose?.();
  host.__adlWatchedProjectRoot = project.root;

  host.__adlProjectWatchDispose = watchAdlProject(project, {
    onReload: ({ generation }) => {
      resetInspectorAgentObserver();
      try {
        ensureInspectorAgentObserver(project.getAdl(), project);
      } catch {
        // Missing `adl` on the reloaded config — catalog loaders will surface it.
      }
      emitProjectReload({ type: "reload", generation });
    },
    onError: (error) => {
      emitProjectReload({
        type: "error",
        generation: project.generation,
        message: error.message,
      });
    },
  });

  try {
    ensureInspectorAgentObserver(project.getAdl(), project);
  } catch {
    // Watcher still useful without a runtime; catalog loaders surface a missing `adl`.
  }
}

export async function getLoadedAdlProject(): Promise<LoadedAdlProject> {
  if (!host.__adlLoadedProject) {
    const root = resolveAdlProjectRoot();
    await ensureProjectEnv(root);
    host.__adlLoadedProject = await loadAdlProject({ root });
  }
  ensureProjectWatch(host.__adlLoadedProject);
  return host.__adlLoadedProject;
}
