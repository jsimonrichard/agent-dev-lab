import { createAgent } from "../agent/create";
import { inMemoryMessageStore } from "../memory/in-memory";
import { createToolFromAgent, createToolFromWorkflow } from "../tools";
import { AdlNotImplementedError } from "../internal/not-implemented";
import { createWorkflow } from "../workflow/create";
import type { AdlRuntime, AdlRuntimeConfig, AdlRuntimeOverrides, RuntimeServices } from "./types";

export type { AdlRuntime } from "./types";

export function createAdlRuntime(config: AdlRuntimeConfig): AdlRuntime {
  const services = resolveServices(config);

  const runtime: AdlRuntime = {
    services,

    createAgent(definition, overrides) {
      return createAgent({
        ...definition,
        runtime,
        ...mergeOverrides(services, overrides),
      });
    },

    createWorkflow(definition, overrides) {
      return createWorkflow({
        ...definition,
        runtime,
        ...mergeOverrides(services, overrides),
      });
    },

    createWorkflowRunContext(overrides) {
      void overrides;
      throw new AdlNotImplementedError("adl.createWorkflowRunContext");
    },

    createToolFromAgent(agent, options) {
      return createToolFromAgent(agent, options);
    },

    createToolFromWorkflow(workflow, options) {
      return createToolFromWorkflow(workflow, options);
    },
  };

  return runtime;
}

function resolveServices(config: AdlRuntimeConfig): RuntimeServices {
  return {
    messageStore: config.messageStore,
    workflowStore: config.workflowStore,
    workflowObservers: config.observers?.workflows ?? [],
    agentObservers: config.observers?.agents ?? [],
  };
}

function mergeOverrides(
  base: RuntimeServices,
  overrides?: AdlRuntimeOverrides,
): AdlRuntimeOverrides {
  if (!overrides) {
    return {};
  }
  return {
    messageStore: overrides.messageStore ?? base.messageStore,
    workflowStore: overrides.workflowStore ?? base.workflowStore,
  };
}

/** In-memory runtime for tests and quick scripts. */
export function createDefaultAdlRuntime(partial?: Partial<AdlRuntimeConfig>): AdlRuntime {
  return createAdlRuntime({
    messageStore: partial?.messageStore ?? inMemoryMessageStore(),
    workflowStore: partial?.workflowStore,
    observers: partial?.observers,
  });
}
