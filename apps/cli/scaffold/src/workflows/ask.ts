import { z } from "zod";

import { adl } from "#adl";

import { assistant } from "../agents/assistant";

const askInput = z.object({
  question: z.string().default("What is Agent Dev Lab?"),
});

/** One-shot LLM workflow so a new project can `adl run ask` after setting an API key. */
export const ask = adl.createWorkflow({
  id: "ask",
  input: askInput,
  output: z.object({
    answer: z.string(),
  }),
  async run(input, ctx) {
    const { question } = askInput.parse(input);
    await ctx.setTitle(question);
    const answer = await ctx.step("answer", async ({ ctx: child }) => {
      const episode = await assistant.run({
        memoryScope: child.memoryScopeWithSuffix("chat"),
        user: question,
      }).result;
      return episode.text;
    });
    return { answer };
  },
});
