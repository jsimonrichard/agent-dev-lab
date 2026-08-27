import path from "node:path";

import { loadAdlProject, type LoadedAdlProject } from "./resolve";
import { watchAdlProject, type AdlProjectReloadInfo, type AdlProjectWatchHandlers } from "./watch";

/**
 * Process-wide inspection-UI host.
 *
 * Vite SSR (TanStack Start / Nitro) may re-evaluate `apps/web` server modules
 * in an isolated `globalThis`. `@agent-dev-lab/core/project` is `ssr.external`,
 * so module-level state here is shared by every request and by `fs.watch`
 * callbacks. Storing {@link LoadedAdlProject} on the Vite module's `globalThis`
 * made reload bump one object while `GET /api/project` kept serving another.
 */
type AdlProjectProcessHost = {
  project?: LoadedAdlProject;
  watchDispose?: () => void;
  watchedRoot?: string;
  listeners: AdlProjectWatchHandlers;
  reloadSubscribers: Set<(event: AdlProjectHostReloadEvent) => void>;
  inspectorAgentObserverAttached: boolean;
  inspectorListedAgentIds: Set<string>;
};

const host: AdlProjectProcessHost = {
  listeners: {},
  reloadSubscribers: new Set(),
  inspectorAgentObserverAttached: false,
  inspectorListedAgentIds: new Set(),
};

export type AdlProjectHostReloadEvent =
  | { type: "reload"; generation: number; path?: string }
  | { type: "error"; generation: number; message: string };

/** Load or reuse the process-wide project for `root`. */
export async function acquireAdlProject(root: string): Promise<LoadedAdlProject> {
  const resolved = path.resolve(root);
  if (host.project && path.resolve(host.project.root) === resolved) {
    return host.project;
  }
  host.watchDispose?.();
  host.watchDispose = undefined;
  host.watchedRoot = undefined;
  host.inspectorAgentObserverAttached = false;
  host.inspectorListedAgentIds = new Set();
  host.project = await loadAdlProject({ root: resolved });
  return host.project;
}

/** Replace watch-side UI callbacks (observer). SSE uses {@link subscribeAdlProjectHostReload}. */
export function setAdlProjectWatchListeners(listeners: AdlProjectWatchHandlers): void {
  host.listeners = listeners;
}

export function ensureAdlProjectFileWatch(enabled: boolean): void {
  const project = host.project;
  if (!project || !enabled) {
    return;
  }
  if (host.watchedRoot === project.root && host.watchDispose) {
    return;
  }
  host.watchDispose?.();
  host.watchedRoot = project.root;
  host.watchDispose = watchAdlProject(project, {
    onReload: (info: AdlProjectReloadInfo) => {
      host.listeners.onReload?.(info);
      emitAdlProjectHostReload({
        type: "reload",
        generation: info.generation,
        path: info.path,
      });
    },
    onError: (error: Error) => {
      host.listeners.onError?.(error);
      emitAdlProjectHostReload({
        type: "error",
        generation: project.generation,
        message: error.message,
      });
    },
  });
}

export function subscribeAdlProjectHostReload(
  subscriber: (event: AdlProjectHostReloadEvent) => void,
): () => void {
  host.reloadSubscribers.add(subscriber);
  return () => {
    host.reloadSubscribers.delete(subscriber);
  };
}

function emitAdlProjectHostReload(event: AdlProjectHostReloadEvent): void {
  for (const subscriber of host.reloadSubscribers) {
    subscriber(event);
  }
}

export function setInspectorListedAgentIds(ids: Iterable<string>): void {
  host.inspectorListedAgentIds = new Set(ids);
}

export function getInspectorListedAgentIds(): Set<string> {
  return host.inspectorListedAgentIds;
}

/** True once per process until {@link clearInspectorAgentObserverAttached}. */
export function markInspectorAgentObserverAttached(): boolean {
  if (host.inspectorAgentObserverAttached) {
    return false;
  }
  host.inspectorAgentObserverAttached = true;
  return true;
}

export function clearInspectorAgentObserverAttached(): void {
  host.inspectorAgentObserverAttached = false;
}

/** Drop watchers and the cached project. For tests only. */
export function resetAdlProjectProcessHost(): void {
  host.watchDispose?.();
  host.watchDispose = undefined;
  host.watchedRoot = undefined;
  host.project = undefined;
  host.listeners = {};
  host.reloadSubscribers.clear();
  host.inspectorAgentObserverAttached = false;
  host.inspectorListedAgentIds = new Set();
}
