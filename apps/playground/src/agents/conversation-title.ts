import type { ConversationTitleInput, ConversationTitleOutput } from "@agent-dev-lab/core";
import { z } from "zod";

import { adl } from "#adl";

const titleSchema = z.object({
  title: z.string().describe("A short 3-8 word conversation title. No quotes."),
});

const namer = adl.createAgent({
  id: "conversation-title-namer",
  instructions:
    "You name conversations. Reply with a short title (3–8 words) that captures the topic. " +
    "No quotes, no trailing punctuation, no explanation.",
  outputSchema: titleSchema,
});

/**
 * Names a conversation from its first turn. Used as `titleWorkflow` on other agents —
 * not registered in `adl.config` so it is not a chat/workflow target and its runs
 * stay out of the inspection UI.
 *
 * Input/output types are pinned with generics (no Zod on the workflow itself).
 */
export const conversationTitle = adl.createWorkflow<
  ConversationTitleInput,
  ConversationTitleOutput
>({
  id: "conversation-title",
  async run(input, ctx) {
    const episode = await namer.run({
      memoryScope: ctx.memoryScopeWithSuffix("namer"),
      user: `Write a short title for this conversation.\n\n${formatTranscript(input.messages)}`,
    }).result;
    const parsed = titleSchema.safeParse(episode.output);
    return { title: parsed.success ? parsed.data.title : episode.text };
  },
});

function formatTranscript(messages: ConversationTitleInput["messages"]): string {
  return messages
    .map((message) => {
      const role =
        message.role === "assistant"
          ? "Assistant"
          : message.role === "user"
            ? "User"
            : message.role;
      const text = typeof message.content === "string" ? message.content : "";
      return text ? `${role}: ${text}` : "";
    })
    .filter((line) => line.length > 0)
    .join("\n\n");
}
