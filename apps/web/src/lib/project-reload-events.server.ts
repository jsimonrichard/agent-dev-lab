import {
  subscribeAdlProjectHostReload,
  type AdlProjectHostReloadEvent,
} from "@agent-dev-lab/core/project";

import type { ProjectReloadEvent } from "./project-reload-types";

type Subscriber = (event: ProjectReloadEvent) => void;

function toClientEvent(event: AdlProjectHostReloadEvent): ProjectReloadEvent {
  if (event.type === "reload") {
    return { type: "reload", generation: event.generation };
  }
  return { type: "error", generation: event.generation, message: event.message };
}

export function subscribeProjectReload(subscriber: Subscriber): () => void {
  return subscribeAdlProjectHostReload((event) => {
    subscriber(toClientEvent(event));
  });
}

export function encodeProjectReloadSse(event: ProjectReloadEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export type { ProjectReloadEvent } from "./project-reload-types";
