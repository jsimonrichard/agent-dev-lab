import { createAgent } from "../agent/create";
import { createToolFromAgent, createToolFromWorkflow } from "../tools";
import { createWorkflow } from "../workflow/create";
import type { AdlRuntime, AdlRuntimeConfig } from "./types";
import { resolveRuntimeConfig, resolveRuntimeOverrides } from "./resolve-overrides";

export type { AdlRuntime } from "./types";

export function createAdlRuntime(config: AdlRuntimeConfig = {}): AdlRuntime {
  const services = resolveRuntimeConfig(config);

  const runtime: AdlRuntime = {
    services,

    createAgent(definition, overrides) {
      return createAgent({
        ...definition,
        runtime,
        services: resolveRuntimeOverrides(services, overrides),
      });
    },

    createWorkflow(definition, overrides) {
      return createWorkflow({
        ...definition,
        runtime,
        services: resolveRuntimeOverrides(services, overrides),
      });
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
