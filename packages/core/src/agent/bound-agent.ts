import type { ToolSet } from "ai";

import type { RuntimeServices } from "../runtime/types";
import { runAgentEpisode, startAgentEpisode } from "./run-episode";
import type {
  Agent,
  AgentDefinition,
  AgentRunHandle,
  AgentRunInput,
  AgentStreamHandle,
  AgentStreamInput,
} from "./types";

export type BoundAgentOptions<Tools extends ToolSet = ToolSet, TOutput = unknown> = {
  definition: AgentDefinition<Tools, TOutput>;
  services: RuntimeServices;
};

/**
 * Agent bound to resolved runtime services (definition + effective stores/observers).
 */
export class BoundAgent<
  Context = undefined,
  Tools extends ToolSet = ToolSet,
  TOutput = unknown,
> implements Agent<Context, Tools> {
  readonly id: string;

  constructor(private readonly options: BoundAgentOptions<Tools, TOutput>) {
    if (!options.definition.id || typeof options.definition.id !== "string") {
      throw new Error('BoundAgent: "id" must be a non-empty string');
    }
    this.id = options.definition.id;
  }

  get definition(): AgentDefinition<Tools, TOutput> {
    return this.options.definition;
  }

  get services(): RuntimeServices {
    return this.options.services;
  }

  run(input: AgentRunInput<Context>): AgentRunHandle<Tools> {
    const controller = new AbortController();
    const episode = runAgentEpisode<Tools>({
      definition: this.options.definition,
      input: input as AgentRunInput<unknown>,
      services: this.options.services,
      abortController: controller,
    });
    return {
      result: episode.then((r) => r.result),
      cancel: () => controller.abort(),
    } satisfies AgentRunHandle<Tools>;
  }

  stream(input: AgentStreamInput<Context>): AgentStreamHandle<Tools> {
    const controller = new AbortController();
    const handle = startAgentEpisode<Tools>({
      definition: this.options.definition,
      input: input as AgentRunInput<unknown>,
      services: this.options.services,
      exposeStream: true,
      abortController: controller,
    });
    return {
      textStream: handle.textStream,
      fullStream: handle.fullStream,
      finished: handle.finished,
      cancel: () => handle.cancel,
    } satisfies AgentStreamHandle<Tools>;
  }
}
