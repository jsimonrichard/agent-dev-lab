import type { ToolSet } from "ai";

import { notImplemented } from "../internal/not-implemented";
import type { Agent, AgentDefinition } from "./types";

export function createAgent<
  Context = undefined,
  Tools extends ToolSet = ToolSet,
  TOutput = unknown,
>(config: AgentDefinition<Tools, TOutput>): Agent<Context, Tools> {
  const id = config.id;
  if (!id || typeof id !== "string") {
    throw new Error('createAgent: "id" must be a non-empty string');
  }

  return {
    id,
    run() {
      notImplemented(`agent.run (${id})`);
    },
    stream() {
      notImplemented(`agent.stream (${id})`);
    },
  };
}
