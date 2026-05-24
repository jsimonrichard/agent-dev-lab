import { createAgentWithServices } from "../agent/create";
import { createToolFromAgent, createToolFromWorkflow } from "../tools";
import { createWorkflowWithServices } from "../workflow/create";
import type { AdlRuntime, AdlRuntimeConfig } from "./types";
import {
  pickAdlRuntimeOverrides,
  resolveRuntimeConfig,
  resolveRuntimeOverrides,
} from "./resolve-overrides";

export type { AdlRuntime } from "./types";

export function createAdlRuntime(config: AdlRuntimeConfig = {}): AdlRuntime {
  const services = resolveRuntimeConfig(config);

  const runtime: AdlRuntime = {
    services,

    createAgent(definition, overrides) {
      return createAgentWithServices({
        ...definition,
        runtime,
        services: resolveRuntimeOverrides(services, overrides),
      });
    },

    createWorkflow(definition, overrides) {
      return createWorkflowWithServices({
        ...definition,
        runtime,
        services: resolveRuntimeOverrides(services, overrides),
        contextOverrides: pickAdlRuntimeOverrides(overrides ?? {}),
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
