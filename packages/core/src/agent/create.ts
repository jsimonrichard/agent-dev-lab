import type { ToolSet } from "ai";

import { resolveDefinitionServices, resolveRuntimeOverrides } from "../runtime/resolve-overrides";
import type { AdlRuntime, AdlRuntimeOverrides } from "../runtime/types";
import { AgentImpl } from "./agent-impl";
import type { Agent, AgentDefinition } from "./types";

/**
 * Functional factory for tests and libraries. In project code, use {@link AdlRuntime.createAgent}.
 */
export function createAgent<
  ToolProviderContext = undefined,
  Tools extends ToolSet = ToolSet,
  TOutput = string,
>(
  runtime: AdlRuntime,
  definition: AgentDefinition<ToolProviderContext, Tools, TOutput>,
  overrides?: AdlRuntimeOverrides,
): Agent<ToolProviderContext, Tools, TOutput> {
  const services = resolveDefinitionServices(
    definition,
    resolveRuntimeOverrides(runtime.services, overrides),
  );
  return new AgentImpl<ToolProviderContext, Tools, TOutput>(definition, services);
}
