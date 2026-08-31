import { adl } from "#adl";

import { conversationTitle } from "./conversation-title";

import { model } from "../model";
import { knowledgeTools } from "../tools/knowledge";

/**
 * Tool-using agent. `agent.run()` uses AI SDK `stopWhen` (default
 * `stepCountIs(20)`). Pass `stopWhen: stepCountIs(1)` when a workflow wants
 * to own each model step.
 */
export const researchAssistant = adl.createAgent({
  id: "research-assistant",
  systemPrompt:
    "You are a research assistant for the Agent Dev Lab (ADL) framework. " +
    "Use the `lookupFact` tool for questions about ADL and the `calculate` tool for any math. " +
    "Call tools when helpful, then give a concise final answer that cites what you found.",
  model,
  tools: knowledgeTools,
  titleWorkflow: conversationTitle,
});
