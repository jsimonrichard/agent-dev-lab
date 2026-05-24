import type { ToolSet } from "ai";

import { AdlNotImplementedError } from "../internal/not-implemented";
import type { Agent, AgentDefinition, AgentRunHandle, AgentStreamHandle } from "./types";

export function createAgent<
  Context = undefined,
  Tools extends ToolSet = ToolSet,
  TOutput = unknown,
>(config: AgentDefinition<Tools, TOutput>): Agent<Context, Tools> {
  const id = config.id;
  if (!id || typeof id !== "string") {
    throw new Error('createAgent: "id" must be a non-empty string');
  }

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
