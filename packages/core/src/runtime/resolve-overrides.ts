import { inMemoryMessageStore } from "../memory/in-memory";
import type { AdlRuntime } from "./types";
import type { AdlRuntimeConfig, AdlRuntimeOverrides, RuntimeServices } from "./types";

/** Splits factory params into definition fields, runtime, and optional overrides. */
export function splitFactoryParams<T extends AdlRuntimeOverrides & { runtime: AdlRuntime }>(
  params: T,
): {
  definition: Omit<T, keyof AdlRuntimeOverrides | "runtime">;
  runtime: AdlRuntime;
  overrides: AdlRuntimeOverrides | undefined;
} {
  const { runtime, ...rest } = params;
  const definition = { ...rest } as T & AdlRuntimeOverrides;
  delete definition.messageStore;
  delete definition.workflowStore;
  delete definition.observers;
  return {
    definition: definition as Omit<T, keyof AdlRuntimeOverrides | "runtime">,
    runtime,
    overrides: pickAdlRuntimeOverrides(params),
  };
}

export function resolveRuntimeConfig(config: AdlRuntimeConfig = {}): RuntimeServices {
  return {
    messageStore: config.messageStore ?? inMemoryMessageStore(),
    workflowStore: config.workflowStore,
    workflowObservers: config.observers?.workflows ?? [],
    agentObservers: config.observers?.agents ?? [],
  };
}

/** Extracts override fields from factory params (definition + {@link AdlRuntimeOverrides}). */
export function pickAdlRuntimeOverrides(
  source: AdlRuntimeOverrides,
): AdlRuntimeOverrides | undefined {
  const overrides: AdlRuntimeOverrides = {};
  if (source.messageStore !== undefined) {
    overrides.messageStore = source.messageStore;
  }
  if (source.workflowStore !== undefined) {
    overrides.workflowStore = source.workflowStore;
  }
  if (source.observers !== undefined) {
    overrides.observers = source.observers;
  }
  return Object.keys(overrides).length > 0 ? overrides : undefined;
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
