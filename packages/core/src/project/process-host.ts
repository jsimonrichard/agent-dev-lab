import path from "node:path";

import { inMemoryEventLog, type InMemoryEventLog } from "../observability/in-memory-event-log";
import { loadAdlProject, type LoadedAdlProject } from "./resolve";
import { watchAdlProject, type AdlProjectReloadInfo, type AdlProjectWatchHandlers } from "./watch";

/**
 * Process-wide inspection-UI host (one project per Node process).
 *
 * Vite config and Nitro's fetchable worker can evaluate this module in different
 * isolates. A module-local `const` then forks: one isolate reloads while `/api`
 * reads another. `process[Symbol.for(...)]` is shared only within an isolate —
 * drive reload via Nitro `dispatchFetch` so the worker that serves runs updates.
 *
 * File watch (`watchAdlProject` / `reload-gate`) is a fallback when the Vite
 * plugin does not see a change. The host still owns the loaded project, the
 * inspector event log, and SSE reload subscribers. Tests call
 * {@link resetAdlProjectProcessHost}.
 */
type AdlProjectProcessHost = {
  project?: LoadedAdlProject;
  watchDispose?: () => void;
  watchedRoot?: string;
  listeners: AdlProjectWatchHandlers;
  reloadSubscribers: Set<(event: AdlProjectHostReloadEvent) => void>;
  inspectorAgentObserverAttached: boolean;
  inspectorListedAgentIds: Set<string>;
  inspectorEventLog?: InMemoryEventLog;
  inspectorEventLogHydrated: boolean;
};

const HOST_KEY = Symbol.for("@agent-dev-lab/core:adlProjectProcessHost");

function getHost(): AdlProjectProcessHost {
  const g = process as typeof process & { [HOST_KEY]?: AdlProjectProcessHost };
  if (!g[HOST_KEY]) {
    g[HOST_KEY] = {
      listeners: {},
      reloadSubscribers: new Set(),
      inspectorAgentObserverAttached: false,
      inspectorListedAgentIds: new Set(),
      inspectorEventLogHydrated: false,
    };
  }
  return g[HOST_KEY]!;
}

export type AdlProjectHostReloadEvent =
  | { type: "reload"; generation: number; path?: string }
  | { type: "error"; generation: number; message: string };

/** Load or reuse the process-wide project for `root`. */
export async function acquireAdlProject(root: string): Promise<LoadedAdlProject> {
  const host = getHost();
  const resolved = path.resolve(root);
  if (host.project && path.resolve(host.project.root) === resolved) {
    return host.project;
  }
  host.watchDispose?.();
  host.watchDispose = undefined;
  host.watchedRoot = undefined;
  host.inspectorAgentObserverAttached = false;
  host.inspectorListedAgentIds = new Set();
  host.inspectorEventLog = undefined;
  host.inspectorEventLogHydrated = false;
  host.project = await loadAdlProject({ root: resolved });
  return host.project;
}

/** Replace watch-side UI callbacks (observer). SSE uses {@link subscribeAdlProjectHostReload}. */
export function setAdlProjectWatchListeners(listeners: AdlProjectWatchHandlers): void {
  getHost().listeners = listeners;
}

export function ensureAdlProjectFileWatch(enabled: boolean): void {
  const host = getHost();
  if (!enabled) {
    host.watchDispose?.();
    host.watchDispose = undefined;
    host.watchedRoot = undefined;
    return;
  }
  const project = host.project;
  if (!project) {
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
  const host = getHost();
  host.reloadSubscribers.add(subscriber);
  return () => {
    host.reloadSubscribers.delete(subscriber);
  };
}

function emitAdlProjectHostReload(event: AdlProjectHostReloadEvent): void {
  for (const subscriber of getHost().reloadSubscribers) {
    subscriber(event);
  }
}

/**
 * Reload the process-wide project and notify SSE subscribers.
 * Used by the Vite dev plugin (and tests) when the bundler's watcher sees
 * registry edits — more reliable than a second `fs.watch` tree beside Vite.
 */
export async function requestAdlProjectReload(triggerPath?: string): Promise<{
  generation: number;
  lastReloadError: string | null;
}> {
  const host = getHost();
  const project = host.project;
  if (!project) {
    throw new Error("requestAdlProjectReload: no project acquired yet");
  }
  try {
    await project.reload();
    const info = { generation: project.generation, path: triggerPath };
    host.listeners.onReload?.(info);
    emitAdlProjectHostReload({
      type: "reload",
      generation: project.generation,
      path: triggerPath,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    host.listeners.onError?.(error instanceof Error ? error : new Error(message));
    emitAdlProjectHostReload({
      type: "error",
      generation: project.generation,
      message,
    });
  }
  return {
    generation: project.generation,
    lastReloadError: project.lastReloadError,
  };
}

export function setInspectorListedAgentIds(ids: Iterable<string>): void {
  getHost().inspectorListedAgentIds = new Set(ids);
}

export function getInspectorListedAgentIds(): Set<string> {
  return getHost().inspectorListedAgentIds;
}

/** True once per process until {@link clearInspectorAgentObserverAttached}. */
export function markInspectorAgentObserverAttached(): boolean {
  const host = getHost();
  if (host.inspectorAgentObserverAttached) {
    return false;
  }
  host.inspectorAgentObserverAttached = true;
  return true;
}

export function clearInspectorAgentObserverAttached(): void {
  getHost().inspectorAgentObserverAttached = false;
}

/**
 * Process-wide inspection event log. Lives here (not `apps/web` `globalThis`) so
 * Vite SSR isolates share one ring buffer.
 */
export function getInspectorEventLog(): InMemoryEventLog {
  const host = getHost();
  if (!host.inspectorEventLog) {
    host.inspectorEventLog = inMemoryEventLog();
  }
  return host.inspectorEventLog;
}

/** True the first time per process-host generation; later calls are no-ops. */
export function markInspectorEventLogHydrated(): boolean {
  const host = getHost();
  if (host.inspectorEventLogHydrated) {
    return false;
  }
  host.inspectorEventLogHydrated = true;
  return true;
}

/** Drop watchers and the cached project. For tests only. */
export function resetAdlProjectProcessHost(): void {
  const host = getHost();
  host.watchDispose?.();
  host.watchDispose = undefined;
  host.watchedRoot = undefined;
  host.project = undefined;
  host.listeners = {};
  host.reloadSubscribers.clear();
  host.inspectorAgentObserverAttached = false;
  host.inspectorListedAgentIds = new Set();
  host.inspectorEventLog = undefined;
  host.inspectorEventLogHydrated = false;
}
