import type { ToolSet } from "ai";

import { resolveDefinitionServices, resolveRuntimeOverrides } from "../runtime/resolve-overrides";
import type { AdlRuntime, AdlRuntimeOverrides } from "../runtime/types";
import { AgentImpl } from "./agent-impl";
import type { Agent, AgentDefinition } from "./types";

export function createAgent<
  Context = undefined,
  Tools extends ToolSet = ToolSet,
  TOutput = unknown,
>(
  runtime: AdlRuntime,
  definition: AgentDefinition<Tools, TOutput>,
  overrides?: AdlRuntimeOverrides,
): Agent<Context, Tools> {
  const services = resolveDefinitionServices(
    definition,
    resolveRuntimeOverrides(runtime.services, overrides),
  );
  return new AgentImpl<Context, Tools, TOutput>(definition, services);
}
