import { openai } from "@ai-sdk/openai";
import type { ToolSet } from "@agent-dev-lab/core";

import { adl } from "#adl";

import { conversationTitle } from "./conversation-title";

/** Sample agent for the inspection UI and `adl run` demos. */
export const researcher = adl.createAgent({
  id: "researcher",
  instructions:
    "You are a concise research assistant. Use the web_search tool before answering. Summarize in a few sentences and include source URLs. Do not invent citations.",
  tools: {
    web_search: openai.tools.webSearch({ searchContextSize: "low" }),
  } as ToolSet,
  titleWorkflow: conversationTitle,
});
