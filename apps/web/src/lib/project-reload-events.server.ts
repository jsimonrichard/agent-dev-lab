import type { ProjectReloadEvent } from "./project-reload-types";

type Subscriber = (event: ProjectReloadEvent) => void;

type ProjectReloadHostGlobal = {
  __adlProjectReloadSubscribers?: Set<Subscriber>;
};

const host = globalThis as ProjectReloadHostGlobal;

function subscribers(): Set<Subscriber> {
  if (!host.__adlProjectReloadSubscribers) {
    host.__adlProjectReloadSubscribers = new Set();
  }
  return host.__adlProjectReloadSubscribers;
}

export function subscribeProjectReload(subscriber: Subscriber): () => void {
  const set = subscribers();
  set.add(subscriber);
  return () => {
    set.delete(subscriber);
  };
}

export function emitProjectReload(event: ProjectReloadEvent): void {
  for (const subscriber of subscribers()) {
    subscriber(event);
  }
}

export function encodeProjectReloadSse(event: ProjectReloadEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export type { ProjectReloadEvent } from "./project-reload-types";
