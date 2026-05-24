import type { ToolSet } from "ai";

import { AdlNotImplementedError } from "../internal/not-implemented";
import type { AdlRuntime } from "../runtime/types";
import type { AdlRuntimeOverrides } from "../runtime/types";
import type { Agent, AgentDefinition, AgentRunHandle, AgentStreamHandle } from "./types";

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
  const { runtime, id } = params;
  if (!id || typeof id !== "string") {
    throw new Error('createAgent: "id" must be a non-empty string');
  }

  void runtime;

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
