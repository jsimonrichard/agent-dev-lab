import type { ToolSet } from "ai";

import { AdlNotImplementedError } from "../internal/not-implemented";
import { resolveRuntimeOverrides, splitFactoryParams } from "../runtime/resolve-overrides";
import type { AdlRuntime, AdlRuntimeOverrides, RuntimeServices } from "../runtime/types";
import type { Agent, AgentDefinition, AgentRunHandle, AgentStreamHandle } from "./types";

/** Functional factory: agent definition plus explicit {@link AdlRuntime}. */
export type CreateAgentParams<Tools extends ToolSet = ToolSet, TOutput = unknown> = AgentDefinition<
  Tools,
  TOutput
> & {
  runtime: AdlRuntime;
} & AdlRuntimeOverrides;

/** @internal Bound factory input after merging runtime services (not for end users). */
export type CreateAgentBoundParams<
  Tools extends ToolSet = ToolSet,
  TOutput = unknown,
> = AgentDefinition<Tools, TOutput> & {
  runtime: AdlRuntime;
  services: RuntimeServices;
};

export function createAgent<
  Context = undefined,
  Tools extends ToolSet = ToolSet,
  TOutput = unknown,
>(params: CreateAgentParams<Tools, TOutput>): Agent<Context, Tools> {
  const { definition, runtime, overrides } = splitFactoryParams(params);
  const services = resolveRuntimeOverrides(runtime.services, overrides);
  return createAgentWithServices({ ...definition, runtime, services });
}

/** @internal */
export function createAgentWithServices<
  Context = undefined,
  Tools extends ToolSet = ToolSet,
  TOutput = unknown,
>(params: CreateAgentBoundParams<Tools, TOutput>): Agent<Context, Tools> {
  const { id, services } = params;
  if (!id || typeof id !== "string") {
    throw new Error('createAgent: "id" must be a non-empty string');
  }

  void services;

  const notReady = (): AgentRunHandle<Tools> => {
    const error = new AdlNotImplementedError(`agent.run (${id})`);
    return {
      result: Promise.reject(error),
      cancel: () => {},
    };
  };

  return {
    id,
    run: notReady,
    stream() {
      const error = new AdlNotImplementedError(`agent.stream (${id})`);
      return {
        finished: Promise.reject(error),
        cancel: () => {},
      } as AgentStreamHandle<Tools>;
    },
  };
}
