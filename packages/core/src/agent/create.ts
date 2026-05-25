import type { ToolSet } from "ai";

import { resolveRuntimeOverrides, splitFactoryParams } from "../runtime/resolve-overrides";
import type { AdlRuntime, AdlRuntimeOverrides } from "../runtime/types";
import { AgentImpl } from "./agent-impl";
import type { Agent, AgentDefinition } from "./types";

/** Functional factory: agent definition plus explicit {@link AdlRuntime}. */
export type CreateAgentParams<Tools extends ToolSet = ToolSet, TOutput = unknown> = AgentDefinition<
  Tools,
  TOutput
> & {
  runtime: AdlRuntime;
} & AdlRuntimeOverrides;

export function createAgent<
  Context = undefined,
  Tools extends ToolSet = ToolSet,
  TOutput = unknown,
>(params: CreateAgentParams<Tools, TOutput>): Agent<Context, Tools> {
  const { definition, runtime, overrides } = splitFactoryParams(params);
  const services = resolveRuntimeOverrides(runtime.services, overrides);
  return new AgentImpl<Context, Tools, TOutput>(definition, services);
}
