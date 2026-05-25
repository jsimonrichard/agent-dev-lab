import type { ToolSet } from "ai";

import { BoundAgent } from "../agent/bound-agent";
import type { Agent, AgentDefinition } from "../agent/types";
import { createToolFromAgent, createToolFromWorkflow } from "../tools";
import { BoundWorkflow } from "../workflow/bound-workflow";
import type { Workflow, WorkflowDefinition } from "../workflow/types";
import type { CreateToolFromAgentOptions } from "../tools/from-agent";
import type { CreateToolFromWorkflowOptions } from "../tools/from-workflow";
import { resolveRuntimeConfig, resolveRuntimeOverrides } from "./resolve-overrides";
import type { AdlRuntime, AdlRuntimeConfig, AdlRuntimeOverrides, RuntimeServices } from "./types";

/** Process-level ADL runtime: owns {@link RuntimeServices} and binds agents/workflows. */
export class AdlRuntimeImpl implements AdlRuntime {
  readonly services: RuntimeServices;

  constructor(config: AdlRuntimeConfig = {}) {
    this.services = resolveRuntimeConfig(config);
  }

  createAgent<Context = undefined, Tools extends ToolSet = ToolSet, TOutput = unknown>(
    definition: AgentDefinition<Tools, TOutput>,
    overrides?: AdlRuntimeOverrides,
  ): Agent<Context, Tools> {
    return new BoundAgent<Context, Tools, TOutput>({
      definition,
      services: resolveRuntimeOverrides(this.services, overrides),
    });
  }

  createWorkflow<TInput, TOutput>(
    definition: WorkflowDefinition<TInput, TOutput>,
    overrides?: AdlRuntimeOverrides,
  ): Workflow<TInput, TOutput> {
    return new BoundWorkflow<TInput, TOutput>({
      definition,
      services: resolveRuntimeOverrides(this.services, overrides),
    });
  }

  createToolFromAgent<Context>(
    agent: Agent<Context>,
    options: CreateToolFromAgentOptions<Context>,
  ): ToolSet[string] {
    return createToolFromAgent(agent, options);
  }

  createToolFromWorkflow<TInput, TOutput>(
    workflow: Workflow<TInput, TOutput>,
    options: CreateToolFromWorkflowOptions<TInput>,
  ): ToolSet[string] {
    return createToolFromWorkflow(workflow, options);
  }
}
