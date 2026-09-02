import type { ToolSet, Tool } from "ai";

import { AgentImpl } from "../agent/agent-impl";
import type { Agent, AgentDefinition } from "../agent/types";
import { createToolFromAgent, createToolFromWorkflow } from "../tools";
import {
  createWorkflowFromAgent,
  type CreateWorkflowFromAgentOptions,
} from "../workflow/from-agent";
import { WorkflowImpl } from "../workflow/workflow-impl";
import type { Workflow, WorkflowDefinition } from "../workflow/types";
import type { CreateToolFromAgentOptions, DefaultToolInput } from "../tools/from-agent";
import type { CreateToolFromWorkflowOptions } from "../tools/from-workflow";
import {
  resolveDefinitionServices,
  resolveRuntimeConfig,
  resolveRuntimeOverrides,
} from "./resolve-overrides";
import type { AdlRuntime, AdlRuntimeConfig, AdlRuntimeOverrides, RuntimeServices } from "./types";
import { buildTemplate } from "../template/create";
import type { TemplateConfig } from "../template/types";
import type { z } from "zod";

/** Process-level ADL runtime: owns {@link RuntimeServices} and binds agents/workflows. */
export class AdlRuntimeImpl implements AdlRuntime {
  readonly services: RuntimeServices;

  constructor(config: AdlRuntimeConfig = {}) {
    this.services = resolveRuntimeConfig(config);
  }

  createAgent<ToolProviderContext = undefined, Tools extends ToolSet = ToolSet, TOutput = string>(
    definition: AgentDefinition<ToolProviderContext, Tools, TOutput>,
    overrides?: AdlRuntimeOverrides,
  ): Agent<ToolProviderContext, Tools, TOutput> {
    return new AgentImpl<ToolProviderContext, Tools, TOutput>(
      definition,
      resolveDefinitionServices(definition, resolveRuntimeOverrides(this.services, overrides)),
    );
  }

  createWorkflow<TInput, TOutput, TRawInput = TInput>(
    definition: WorkflowDefinition<TInput, TOutput, TRawInput>,
    overrides?: AdlRuntimeOverrides,
  ): Workflow<TInput, TOutput, TRawInput> {
    return new WorkflowImpl<TInput, TOutput, TRawInput>(
      definition,
      resolveRuntimeOverrides(this.services, overrides),
    );
  }

  createToolFromAgent<
    ToolProviderContext = undefined,
    Tools extends ToolSet = ToolSet,
    TOutput = string,
    TToolInput = DefaultToolInput,
  >(
    agent: Agent<ToolProviderContext, Tools, TOutput>,
    options: CreateToolFromAgentOptions<ToolProviderContext, TToolInput>,
  ): Tool<TToolInput, TOutput> {
    return createToolFromAgent(this, agent, options);
  }

  createToolFromWorkflow<TInput, TOutput, TRawInput = TInput, TToolInput = TRawInput>(
    workflow: Workflow<TInput, TOutput, TRawInput>,
    options: CreateToolFromWorkflowOptions<TRawInput, TToolInput>,
  ): Tool<TToolInput, TOutput> {
    return createToolFromWorkflow(this, workflow, options);
  }

  createWorkflowFromAgent<
    ToolProviderContext = undefined,
    Tools extends ToolSet = ToolSet,
    TOutput = string,
  >(
    agent: Agent<ToolProviderContext, Tools, TOutput>,
    options?: CreateWorkflowFromAgentOptions<ToolProviderContext>,
  ): Workflow<string, TOutput, string> {
    return createWorkflowFromAgent(this, agent, options);
  }

  createTemplate<TSchema extends z.ZodType<object>>(config: TemplateConfig<TSchema>) {
    return buildTemplate(this.services.templateEngine, config);
  }
}
