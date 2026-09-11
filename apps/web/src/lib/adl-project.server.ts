import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ADL_FRAMEWORK_DEV_ENV,
  ADL_PROJECT_ROOT_ENV,
  ADL_PROJECT_WATCH_ENV,
  acquireAdlProject,
  ensureAdlProjectFileWatch,
  shouldWatchAdlProject,
  findAdlProjectRootFromCwd,
  setAdlProjectWatchListeners,
  type LoadedAdlProject,
} from "@agent-dev-lab/core/project";

import { logAdlProjectReload } from "#/lib/adl-project-reload-log";
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

// `ADL_PROJECT_WATCH=0` is the `--serve` opt-out. Do not derive watch from
// `ADL_INSPECTOR_SERVE` — packed `adl dashboard` also runs Nitro `.output`.
if (shouldWatchAdlProject()) {
  process.env[ADL_PROJECT_WATCH_ENV] = "1";
}

function bindInspectorWatchListeners(project: LoadedAdlProject): void {
  setAdlProjectWatchListeners({
    onReload: (info) => {
      logAdlProjectReload({ type: "reload", root: project.root, path: info.path });
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
    onError: (error) => {
      logAdlProjectReload({ type: "error", message: error.message });
    },
  });
}

export async function getLoadedAdlProject(): Promise<LoadedAdlProject> {
  const root = resolveAdlProjectRoot();
  const project = await acquireAdlProject(root);
  bindInspectorWatchListeners(project);
  await ensureAdlProjectFileWatch(shouldWatchAdlProject());
  try {
    await ensureInspectorAgentObserver(project.getAdl(), project);
  } catch {
    // getAdl() throws when config.adl is missing; catalog loaders surface that.
  }
  return project;
}
