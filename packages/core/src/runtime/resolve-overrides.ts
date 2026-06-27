import type { AgentMemoryConfig } from "../agent/types";
import { inMemoryMessageStore } from "../memory/in-memory";
import { inMemoryWorkflowStore } from "../observability/in-memory-workflow-store";
import { TemplateEngine } from "../template/engine";
import { WorkflowContextScope } from "../workflow/workflow-context-scope";
import type { AdlRuntime } from "./types";
import type { AdlRuntimeConfig, AdlRuntimeOverrides, RuntimeServices } from "./types";

/** Applies definition-level store overrides once at bind time (agent/workflow factories). */
export function resolveDefinitionServices(
  definition: { memory?: AgentMemoryConfig },
  services: RuntimeServices,
): RuntimeServices {
  const messageStore = definition.memory?.store;
  if (!messageStore) {
    return services;
  }
  return {
    ...services,
    stores: {
      ...services.stores,
      message: messageStore,
    },
  };
}

/** Splits factory params into definition fields, runtime, and optional overrides. */
export function splitFactoryParams<T extends AdlRuntimeOverrides & { runtime: AdlRuntime }>(
  params: T,
): {
  definition: Omit<T, keyof AdlRuntimeOverrides | "runtime">;
  runtime: AdlRuntime;
  overrides: AdlRuntimeOverrides | undefined;
} {
  const { runtime, stores, observers, ...definition } = params;
  const overrides: AdlRuntimeOverrides | undefined =
    stores === undefined && observers === undefined
      ? undefined
      : {
          ...(stores !== undefined ? { stores } : {}),
          ...(observers !== undefined ? { observers } : {}),
        };
  return {
    definition: definition as Omit<T, keyof AdlRuntimeOverrides | "runtime">,
    runtime,
    overrides,
  };
}

export function resolveRuntimeConfig(config: AdlRuntimeConfig = {}): RuntimeServices {
  return {
    stores: {
      message: config.stores?.message ?? inMemoryMessageStore(),
      workflow: config.stores?.workflow ?? inMemoryWorkflowStore(),
    },
    observers: {
      workflows: config.observers?.workflows ?? [],
      agents: config.observers?.agents ?? [],
    },
    templateEngine: new TemplateEngine(),
    workflowContextScope: new WorkflowContextScope(),
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
    stores: {
      message: overrides.stores?.message ?? base.stores.message,
      workflow: overrides.stores?.workflow ?? base.stores.workflow,
    },
    observers: {
      workflows: [...base.observers.workflows, ...(overrides.observers?.workflows ?? [])],
      agents: [...base.observers.agents, ...(overrides.observers?.agents ?? [])],
    },
    templateEngine: base.templateEngine,
    workflowContextScope: base.workflowContextScope,
  };
}
