import type { AgentMemoryConfig } from "../agent/types";
import { composeEffectHandlers } from "../effect/compose";
import { createDebugSession } from "../effect/debug-session";
import { allowAllGate } from "../effect/gates";
import { parkingEffectGate } from "../effect/park";
import type { EffectGate, EffectHandler } from "../effect/types";
import { inMemoryMessageStore } from "../stores/in-memory";
import { trackMessageStoreAccess } from "../stores/track-access";
import { inMemoryWorkflowStore } from "../stores/in-memory-workflow-store";
import { TemplateEngine } from "../template/engine";
import { WorkflowContextScope } from "../workflow/workflow-context-scope";
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
      message: trackMessageStoreAccess(messageStore, services.workflowContextScope),
    },
    defaults: services.defaults,
    tools: services.tools,
    telemetry: services.telemetry,
    projectRoot: services.projectRoot,
  };
}

function gateAsHandler(gate: EffectGate): EffectHandler {
  return {
    onIntent(intent) {
      return gate.handle(intent);
    },
  };
}

export function resolveRuntimeConfig(config: AdlRuntimeConfig = {}): RuntimeServices {
  const workflowContextScope = new WorkflowContextScope();
  const debugSession = createDebugSession();
  const hostGate = config.effectGate ?? allowAllGate;
  const inner = composeEffectHandlers([debugSession.handler, gateAsHandler(hostGate)]);
  const effectGate: EffectGate = {
    handle(intent) {
      // Read the store at decision time: per-call overrides live on the active run's
      // services, and project reload re-pins `services.stores.workflow` in place.
      const store = (workflowContextScope.peekServices() ?? services).stores.workflow;
      return parkingEffectGate(inner, {
        store,
        recorder: workflowContextScope.peekRunRecorder(),
        signal: workflowContextScope.peek()?.signal,
      }).handle(intent);
    },
  };
  const services: RuntimeServices = {
    stores: {
      message: trackMessageStoreAccess(
        config.stores?.message ?? inMemoryMessageStore(),
        workflowContextScope,
      ),
      workflow: config.stores?.workflow ?? inMemoryWorkflowStore(),
    },
    observers: {
      workflows: config.observers?.workflows ?? [],
      agents: config.observers?.agents ?? [],
    },
    templateEngine: new TemplateEngine(),
    workflowContextScope,
    debugSession,
    effectGate,
    defaults: config.defaults ?? {},
    tools: config.tools ?? {},
    telemetry: config.telemetry,
    version: config.version,
    projectRoot: config.projectRoot,
  };
  return services;
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
      message: overrides.stores?.message
        ? trackMessageStoreAccess(overrides.stores.message, base.workflowContextScope)
        : base.stores.message,
      workflow: overrides.stores?.workflow ?? base.stores.workflow,
    },
    observers: {
      workflows: [...base.observers.workflows, ...(overrides.observers?.workflows ?? [])],
      agents: [...base.observers.agents, ...(overrides.observers?.agents ?? [])],
    },
    templateEngine: base.templateEngine,
    workflowContextScope: base.workflowContextScope,
    debugSession: base.debugSession,
    effectGate: base.effectGate,
    defaults: base.defaults,
    tools: base.tools,
    telemetry: base.telemetry,
    version: base.version,
    projectRoot: base.projectRoot,
  };
}
