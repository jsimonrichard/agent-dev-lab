import {
  subscribeAdlProjectHostReload,
  type AdlProjectHostReloadEvent,
} from "@agent-dev-lab/core/project";

import type { ProjectReloadEvent } from "./project-reload-types";

type Subscriber = (event: ProjectReloadEvent) => void;

const subscribersKey = "__adlProjectReloadSubscribers" as const;

type ReloadGlobal = typeof globalThis & {
  [subscribersKey]?: Set<Subscriber>;
};

function localSubscribers(): Set<Subscriber> {
  const g = globalThis as ReloadGlobal;
  if (!g[subscribersKey]) {
    g[subscribersKey] = new Set();
  }
  return g[subscribersKey];
}

function toClientEvent(event: AdlProjectHostReloadEvent): ProjectReloadEvent {
  if (event.type === "reload") {
    return { type: "reload", generation: event.generation };
  }
  return { type: "error", generation: event.generation, message: event.message };
}

export function subscribeProjectReload(subscriber: Subscriber): () => void {
  const subscribers = localSubscribers();
  subscribers.add(subscriber);
  const unsubscribeHost = subscribeAdlProjectHostReload((event) => {
    subscriber(toClientEvent(event));
  });
  return () => {
    subscribers.delete(subscriber);
    unsubscribeHost();
  };
}

/** Notify connected UIs before SSE/HTTP teardown on process shutdown. */
export function publishServerShutdown(reason: "graceful" | "forced"): void {
  const event: ProjectReloadEvent = { type: "server_shutdown", reason };
  for (const subscriber of localSubscribers()) {
    try {
      subscriber(event);
    } catch {
      // ignore subscriber errors
    }
  }
}

export function encodeProjectReloadSse(event: ProjectReloadEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export type { ProjectReloadEvent } from "./project-reload-types";
