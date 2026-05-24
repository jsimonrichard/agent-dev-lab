import { inMemoryMessageStore } from "../memory/in-memory";
import type { AdlRuntimeConfig, AdlRuntimeOverrides, RuntimeServices } from "./types";

export function resolveRuntimeConfig(config: AdlRuntimeConfig = {}): RuntimeServices {
  return {
    messageStore: config.messageStore ?? inMemoryMessageStore(),
    workflowStore: config.workflowStore,
    workflowObservers: config.observers?.workflows ?? [],
    agentObservers: config.observers?.agents ?? [],
  };
}

/** Merges runtime services with per-call overrides (observer lists concatenated). */
export function resolveRuntimeOverrides(
  base: RuntimeServices,
  overrides?: AdlRuntimeOverrides,
): RuntimeServices {
  if (!overrides) {
    return base;
  }

  return {
    messageStore: overrides.messageStore ?? base.messageStore,
    workflowStore: overrides.workflowStore ?? base.workflowStore,
    workflowObservers: [...base.workflowObservers, ...(overrides.observers?.workflows ?? [])],
    agentObservers: [...base.agentObservers, ...(overrides.observers?.agents ?? [])],
  };
}
