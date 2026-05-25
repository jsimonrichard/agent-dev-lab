import type { ToolSet } from "ai";

import { resolveRuntimeOverrides, splitFactoryParams } from "../runtime/resolve-overrides";
import type { AdlRuntime, AdlRuntimeOverrides, RuntimeServices } from "../runtime/types";
import { runAgentEpisode, startAgentEpisode } from "./run-episode";
import type {
  Agent,
  AgentDefinition,
  AgentRunHandle,
  AgentRunInput,
  AgentStreamHandle,
  AgentStreamInput,
} from "./types";

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
  const {
    id,
    runtime: _runtime,
    services,
    instructions,
    model,
    tools,
    outputSchema,
    memory,
  } = params;
  void _runtime;
  if (!id || typeof id !== "string") {
    throw new Error('createAgent: "id" must be a non-empty string');
  }

  const agentDefinition: AgentDefinition<Tools, TOutput> = {
    id,
    instructions,
    model,
    tools,
    outputSchema,
    memory,
  };

  return {
    id,
    run(input: AgentRunInput<Context>) {
      const controller = new AbortController();
      const episode = runAgentEpisode<Tools>({
        definition: agentDefinition,
        input: input as AgentRunInput<unknown>,
        services,
        abortController: controller,
      });
      return {
        result: episode.then((r) => r.result),
        cancel: () => controller.abort(),
      } satisfies AgentRunHandle<Tools>;
    },
    stream(input: AgentStreamInput<Context>) {
      const controller = new AbortController();
      const handle = startAgentEpisode<Tools>({
        definition: agentDefinition,
        input: input as AgentRunInput<unknown>,
        services,
        exposeStream: true,
        abortController: controller,
      });
      return {
        textStream: handle.textStream,
        fullStream: handle.fullStream,
        finished: handle.finished,
        cancel: handle.cancel,
      } satisfies AgentStreamHandle<Tools>;
    },
  };
}
