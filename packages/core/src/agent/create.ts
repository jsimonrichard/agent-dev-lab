import type { ToolSet } from "ai";

import {
  resolveDefinitionServices,
  resolveRuntimeOverrides,
} from "../runtime/resolve-overrides.js";
import type { AdlRuntime, AdlRuntimeOverrides } from "../runtime/types.js";
import { AgentImpl } from "./agent-impl.js";
import type { Agent, AgentDefinition } from "./types.js";

/**
 * Functional factory for tests and libraries. In project code, use {@link AdlRuntime.createAgent}.
 */
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
