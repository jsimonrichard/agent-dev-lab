import { tool } from "@agent-dev-lab/core";
import { z } from "zod";

import { adl } from "../adl";
import { finalTextStream, fixtureMockModel, toolCallStream } from "../mock-streams";
import { TOOL_LOOP_DONE, TOOL_LOOP_TOOL_NAME } from "../replies";

function promptHasCompletedToolCall(prompt: unknown): boolean {
  if (!Array.isArray(prompt)) {
    throw new Error("tool-loop-agent: expected language-model prompt array");
  }
  for (const message of prompt) {
    if (!message || typeof message !== "object" || !("role" in message)) {
      continue;
    }
    if (message.role === "tool") {
      return true;
    }
    if (message.role === "assistant" && "content" in message && Array.isArray(message.content)) {
      const called = message.content.some(
        (part: unknown) =>
          part !== null && typeof part === "object" && "type" in part && part.type === "tool-call",
      );
      if (called) {
        return true;
      }
    }
  }
  return false;
}

export const toolLoopAgent = adl.createAgent({
  id: "tool-loop-agent",
  systemPrompt: "Call lookup, then reply with the fixture done token.",
  model: fixtureMockModel(async ({ prompt }: { prompt: unknown }) => {
    if (promptHasCompletedToolCall(prompt)) {
      return finalTextStream(TOOL_LOOP_DONE);
    }
    return toolCallStream(TOOL_LOOP_TOOL_NAME, JSON.stringify({ topic: "adl" }));
  }),
  tools: {
    lookup: tool({
      description: "Look up a topic",
      inputSchema: z.object({ topic: z.string() }),
      execute: async ({ topic }) => ({ topic, fact: "a workflow framework" }),
    }),
  },
});
