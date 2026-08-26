import { adl } from "#adl";

import { conversationTitle } from "./conversation-title";

import { model } from "../model";
import { knowledgeTools } from "../tools/knowledge";

/**
 * Tool-using agent. Each `agent.run()` is a single AI SDK step, so the model either
 * emits tool calls (executed by the SDK) or final text. The multi-step tool loop is
 * driven by the `answer-question` workflow, which re-runs this agent until it produces
 * a final answer — ADL's "tool loops live in workflow TypeScript" design.
 */
export const researchAssistant = adl.createAgent({
  id: "research-assistant",
  instructions:
    "You are a research assistant for the Agent Dev Lab (ADL) framework. " +
    "Use the `lookupFact` tool for questions about ADL and the `calculate` tool for any math. " +
    "Call tools when helpful, then give a concise final answer that cites what you found.",
  model,
  tools: knowledgeTools,
  titleWorkflow: conversationTitle,
});
