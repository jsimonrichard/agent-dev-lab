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
 * File watch (`watchAdlProject` / `reload-gate`) runs here, in the worker
 * isolate that serves `/api`, so a reload updates the registry that actually
 * executes runs. The host also owns the loaded project, the inspector event
 * log, and SSE reload subscribers. Tests call
 * {@link resetAdlProjectProcessHost}.
 */
type AdlProjectProcessHost = {
  project?: LoadedAdlProject;
  watchDispose?: () => void;
  watchedRoot?: string;
  watchReady?: Promise<void>;
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
  const previous = host.project;
  host.watchDispose?.();
  host.watchDispose = undefined;
  host.watchedRoot = undefined;
  host.watchReady = undefined;
  host.inspectorAgentObserverAttached = false;
  host.inspectorListedAgentIds = new Set();
  host.inspectorEventLog = undefined;
  host.inspectorEventLogHydrated = false;
  if (previous) {
    await previous.dispose();
  }
  host.project = await loadAdlProject({ root: resolved });
  return host.project;
}

/** Replace watch-side callbacks. Subscribers use {@link subscribeAdlProjectHostReload}. */
export function setAdlProjectWatchListeners(listeners: AdlProjectWatchHandlers): void {
  getHost().listeners = listeners;
}

/**
 * Arm (or tear down) the project file watch. The returned promise resolves once
 * the watcher is actually subscribed, so a caller can guarantee that an edit
 * made after it is awaited will be seen.
 *
 * If arming fails the watch is forgotten rather than remembered as live, so the
 * next call retries; the failure itself reaches subscribers as an `error` event.
 * Recording a watcher that never armed is what makes a dead watch look exactly
 * like a project nobody edited.
 */
export function ensureAdlProjectFileWatch(enabled: boolean): Promise<void> {
  const host = getHost();
  if (!enabled) {
    host.watchDispose?.();
    host.watchDispose = undefined;
    host.watchedRoot = undefined;
    host.watchReady = undefined;
    return Promise.resolve();
  }
  const project = host.project;
  if (!project) {
    return Promise.resolve();
  }
  if (host.watchedRoot === project.root && host.watchReady) {
    return host.watchReady;
  }
  host.watchDispose?.();
  const watcher = watchAdlProject(project, {
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
  host.watchedRoot = project.root;
  host.watchDispose = () => {
    watcher.close();
  };
  host.watchReady = watcher.ready.catch(() => {
    if (host.watchedRoot === project.root) {
      host.watchDispose?.();
      host.watchDispose = undefined;
      host.watchedRoot = undefined;
      host.watchReady = undefined;
    }
  });
  return host.watchReady;
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

/** Reload the process-wide project and notify subscribers. */
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

/** Process-wide inspection event log (one ring buffer per process). */
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
export async function resetAdlProjectProcessHost(): Promise<void> {
  const host = getHost();
  host.watchDispose?.();
  host.watchDispose = undefined;
  host.watchedRoot = undefined;
  host.watchReady = undefined;
  const previous = host.project;
  host.project = undefined;
  host.listeners = {};
  host.reloadSubscribers.clear();
  host.inspectorAgentObserverAttached = false;
  host.inspectorListedAgentIds = new Set();
  host.inspectorEventLog = undefined;
  host.inspectorEventLogHydrated = false;
  if (previous) {
    await previous.dispose();
  }
}
