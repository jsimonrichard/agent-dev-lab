import type { ToolSet } from "ai";

import { resolveRuntimeOverrides, splitFactoryParams } from "../runtime/resolve-overrides";
import type { AdlRuntime, AdlRuntimeOverrides } from "../runtime/types";
import { BoundAgent, type BoundAgentOptions } from "./bound-agent";
import type { Agent, AgentDefinition } from "./types";

/** Functional factory: agent definition plus explicit {@link AdlRuntime}. */
export type CreateAgentParams<Tools extends ToolSet = ToolSet, TOutput = unknown> = AgentDefinition<
  Tools,
  TOutput
> & {
  runtime: AdlRuntime;
} & AdlRuntimeOverrides;

/** @internal Resolved binding (definition + effective services only). */
export type CreateAgentBoundParams<
  Tools extends ToolSet = ToolSet,
  TOutput = unknown,
> = BoundAgentOptions<Tools, TOutput>;

export function createAgent<
  Context = undefined,
  Tools extends ToolSet = ToolSet,
  TOutput = unknown,
>(params: CreateAgentParams<Tools, TOutput>): Agent<Context, Tools> {
  const { definition, runtime, overrides } = splitFactoryParams(params);
  const services = resolveRuntimeOverrides(runtime.services, overrides);
  return createAgentWithServices<Context, Tools, TOutput>({ definition, services });
}

/** @internal Thin wrapper over {@link BoundAgent}. */
export function createAgentWithServices<
  Context = undefined,
  Tools extends ToolSet = ToolSet,
  TOutput = unknown,
>(params: CreateAgentBoundParams<Tools, TOutput>): BoundAgent<Context, Tools, TOutput> {
  return new BoundAgent<Context, Tools, TOutput>(params);
}
