import { inMemoryMessageStore } from "../memory/in-memory";
import type { AdlRuntime } from "./types";
import type {
  AdlRuntimeConfig,
  AdlRuntimeOptions,
  AdlRuntimeOverrides,
  RuntimeServices,
} from "./types";

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
  delete definition.stores;
  delete definition.observers;
  return {
    definition: definition as Omit<T, keyof AdlRuntimeOverrides | "runtime">,
    runtime,
    overrides: pickAdlRuntimeOverrides(params),
  };
}

export function resolveRuntimeConfig(config: AdlRuntimeConfig = {}): RuntimeServices {
  return {
    stores: {
      message: config.stores?.message ?? inMemoryMessageStore(),
      workflow: config.stores?.workflow,
    },
    observers: {
      workflows: config.observers?.workflows ?? [],
      agents: config.observers?.agents ?? [],
    },
  };
}

/** Extracts override fields from factory params (definition + {@link AdlRuntimeOverrides}). */
export function pickAdlRuntimeOverrides(
  source: AdlRuntimeOptions,
): AdlRuntimeOverrides | undefined {
  const overrides: AdlRuntimeOverrides = {};
  if (source.stores !== undefined) {
    overrides.stores = source.stores;
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
    stores: {
      message: overrides.stores?.message ?? base.stores.message,
      workflow: overrides.stores?.workflow ?? base.stores.workflow,
    },
    observers: {
      workflows: [...base.observers.workflows, ...(overrides.observers?.workflows ?? [])],
      agents: [...base.observers.agents, ...(overrides.observers?.agents ?? [])],
    },
  };
}
