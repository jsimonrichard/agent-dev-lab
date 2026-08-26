import { readdirSync, statSync, watch, type FSWatcher } from "node:fs";
import path from "node:path";

import { createAdlProjectReloadGate } from "./reload-gate";
import type { LoadedAdlProject } from "./resolve";
import { isIgnoredAdlProjectSegment, shouldReloadAdlProjectPath } from "./watch-path";

export type AdlProjectReloadInfo = {
  generation: number;
  path?: string;
};

export type AdlProjectWatchHandlers = {
  onReload?: (info: AdlProjectReloadInfo) => void;
  onError?: (error: Error) => void;
};

function isIgnoredAdlProjectPath(filePath: string, projectRoot: string): boolean {
  const relative = path.relative(path.resolve(projectRoot), path.resolve(filePath));
  if (relative.startsWith("..")) {
    return true;
  }
  return relative
    .split(path.sep)
    .some((segment) => segment.length > 0 && isIgnoredAdlProjectSegment(segment));
}

/**
 * Watch an ADL project directory and call {@link LoadedAdlProject.reload} when
 * registry source files change. Ignored trees (`node_modules`, `.data`, …) are
 * never subscribed. Returns a dispose function.
 *
 * Each non-ignored directory is watched non-recursively so nested files such as
 * `src/workflows/answer-question.ts` are covered even when `fs.watch({ recursive })`
 * is unreliable.
 */
export function watchAdlProject(
  project: LoadedAdlProject,
  handlers: AdlProjectWatchHandlers = {},
): () => void {
  const watchers: FSWatcher[] = [];
  const watchedDirs = new Set<string>();

  const gate = createAdlProjectReloadGate({
    reload: () => project.reload(),
    onReload: (triggerPath) => {
      handlers.onReload?.({ generation: project.generation, path: triggerPath });
    },
    onError: handlers.onError,
  });

  const onWatchError = (error: Error) => {
    handlers.onError?.(error);
  };

  const watchDirectory = (dir: string) => {
    const resolved = path.resolve(dir);
    if (watchedDirs.has(resolved) || isIgnoredAdlProjectPath(resolved, project.root)) {
      return;
    }
    watchedDirs.add(resolved);

    try {
      const watcher = watch(resolved, { recursive: false }, (_event, filename) => {
        handleEvent(resolved, filename);
      });
      watcher.on("error", (error: Error) => {
        onWatchError(error);
      });
      watchers.push(watcher);
    } catch (error) {
      onWatchError(error instanceof Error ? error : new Error(String(error)));
    }
  };

  const watchTree = (dir: string) => {
    watchDirectory(dir);
    try {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isDirectory() || isIgnoredAdlProjectSegment(entry.name)) {
          continue;
        }
        watchTree(path.join(dir, entry.name));
      }
    } catch (error) {
      onWatchError(error instanceof Error ? error : new Error(String(error)));
    }
  };

  const handleEvent = (watchRoot: string, filename: string | Buffer | null) => {
    // Linux inotify often omits `filename` (null) on rename/atomic save. Still
    // debounce a reload for events from a tree we already decided to watch.
    if (!filename) {
      gate.schedule(watchRoot);
      return;
    }
    const relative = typeof filename === "string" ? filename : filename.toString();
    const fullPath = path.join(watchRoot, relative);

    try {
      if (
        statSync(fullPath).isDirectory() &&
        !isIgnoredAdlProjectSegment(path.basename(fullPath))
      ) {
        watchTree(fullPath);
      }
    } catch {
      // Path may have been removed between the event and stat.
    }

    if (!shouldReloadAdlProjectPath(fullPath, project.root)) {
      return;
    }
    gate.schedule(fullPath);
  };

  watchTree(project.root);

  return () => {
    gate.dispose();
    for (const watcher of watchers) {
      watcher.close();
    }
  };
}
