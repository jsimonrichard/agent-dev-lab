import path from "node:path";

import { watch, type FSWatcher } from "chokidar";

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

export type AdlProjectWatcher = {
  /**
   * Resolves once the initial scan has subscribed every directory under the
   * project root; rejects if the watcher could not arm at all.
   *
   * Await it before relying on an edit being noticed. The scan is asynchronous
   * — about 12 ms for a small project here, and slower on a loaded machine —
   * and an edit made before it finishes is never reported.
   */
  readonly ready: Promise<void>;
  close(): void;
};

/**
 * Watch an ADL project directory and call {@link LoadedAdlProject.reload} when
 * registry source files change.
 *
 * Ignored trees (`node_modules`, `.data`, …) are pruned during the scan rather
 * than filtered afterwards, so they are never subscribed, and symlinks are not
 * followed — a project may link a tree far larger than itself.
 */
export function watchAdlProject(
  project: LoadedAdlProject,
  handlers: AdlProjectWatchHandlers = {},
): AdlProjectWatcher {
  const root = path.resolve(project.root);

  const gate = createAdlProjectReloadGate({
    reload: () => project.reload(),
    onReload: (triggerPath) => {
      handlers.onReload?.({ generation: project.generation, path: triggerPath });
    },
    onError: handlers.onError,
  });

  const watcher: FSWatcher = watch(root, {
    ignoreInitial: true,
    followSymlinks: false,
    ignored: (candidate: string) =>
      path
        .relative(root, path.resolve(candidate))
        .split(path.sep)
        .some((segment) => segment.length > 0 && isIgnoredAdlProjectSegment(segment)),
  });

  let armed = false;
  const ready = new Promise<void>((resolve, reject) => {
    watcher.once("ready", () => {
      armed = true;
      resolve();
    });
    watcher.on("error", (error: unknown) => {
      const failure = error instanceof Error ? error : new Error(String(error));
      // An error before `ready` means nothing was subscribed. Fail closed: the
      // caller must be able to tell "armed" from "arming failed", or a dead
      // watcher is indistinguishable from a project nobody edited.
      if (!armed) {
        reject(failure);
      }
      handlers.onError?.(failure);
    });
  });
  // A caller that never awaits `ready` should not crash the process on an
  // arming failure — it is already reported through `onError`. Real awaiters
  // still see the rejection; this only keeps it from going unhandled.
  void ready.catch(() => {});

  watcher.on("all", (_event, changedPath: string) => {
    if (!shouldReloadAdlProjectPath(changedPath, root)) {
      return;
    }
    gate.schedule(path.resolve(changedPath));
  });

  return {
    ready,
    close() {
      gate.dispose();
      void watcher.close();
    },
  };
}
