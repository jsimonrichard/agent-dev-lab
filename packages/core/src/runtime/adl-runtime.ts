import type { ToolSet } from "ai";

import { AgentImpl } from "../agent/agent-impl.js";
import type { Agent, AgentDefinition } from "../agent/types.js";
import { createToolFromAgent, createToolFromWorkflow } from "../tools/index.js";
import { WorkflowImpl } from "../workflow/workflow-impl.js";
import type { Workflow, WorkflowDefinition } from "../workflow/types.js";
import type { CreateToolFromAgentOptions } from "../tools/from-agent.js";
import type { CreateToolFromWorkflowOptions } from "../tools/from-workflow.js";
import {
  resolveDefinitionServices,
  resolveRuntimeConfig,
  resolveRuntimeOverrides,
} from "./resolve-overrides.js";
import type {
  AdlRuntime,
  AdlRuntimeConfig,
  AdlRuntimeOverrides,
  RuntimeServices,
} from "./types.js";
import { buildTemplate } from "../template/create.js";
import type { TemplateConfig } from "../template/types.js";
import type { z } from "zod";

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
    return new AgentImpl<Context, Tools, TOutput>(
      definition,
      resolveDefinitionServices(definition, resolveRuntimeOverrides(this.services, overrides)),
    );
  }

  createWorkflow<TInput, TOutput>(
    definition: WorkflowDefinition<TInput, TOutput>,
    overrides?: AdlRuntimeOverrides,
  ): Workflow<TInput, TOutput> {
    return new WorkflowImpl<TInput, TOutput>(
      definition,
      resolveRuntimeOverrides(this.services, overrides),
    );
  }

  createToolFromAgent<Context>(
    agent: Agent<Context>,
    options: CreateToolFromAgentOptions<Context>,
  ): ToolSet[string] {
    return createToolFromAgent(this, agent, options);
  }

  createToolFromWorkflow<TInput, TOutput>(
    workflow: Workflow<TInput, TOutput>,
    options: CreateToolFromWorkflowOptions<TInput>,
  ): ToolSet[string] {
    return createToolFromWorkflow(this, workflow, options);
  }

  createTemplate<TSchema extends z.ZodType>(config: TemplateConfig<TSchema>) {
    return buildTemplate(this.services.templateEngine, config);
  }
}
