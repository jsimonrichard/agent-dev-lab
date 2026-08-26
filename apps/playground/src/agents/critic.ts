import { openai } from "@ai-sdk/openai";
import type { ToolSet } from "@agent-dev-lab/core";

import { adl } from "#adl";

/** Second sample agent so a single step can host two selectable episodes. */
export const critic = adl.createAgent({
  id: "critic",
  instructions:
    "You are a skeptical reviewer. Use the web_search tool when you need to check a claim. List 2–3 open questions or gaps. Be concise. Do not invent citations.",
  tools: {
    web_search: openai.tools.webSearch({ searchContextSize: "low" }),
  } as ToolSet,
});
