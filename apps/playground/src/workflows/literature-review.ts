import { z } from "zod";

import { adl } from "#adl";

import { critic } from "../agents/critic";
import { researcher } from "../agents/researcher";

/** LLM-backed sample workflow. Requires `OPENAI_API_KEY`. */
export const literatureReview = adl.createWorkflow({
  id: "literature-review",
  input: z.object({
    topic: z.string().min(1),
  }),
  run: async (input, ctx) => {
    const { briefing, critique } = await ctx.step("research", async ({ ctx: child }) => {
      const [briefingEpisode, critiqueEpisode] = await Promise.all([
        researcher.run({
          memoryScope: child.memoryScopeWithSuffix("notes"),
          user: `Give a brief research briefing on: ${input.topic}`,
        }).result,
        critic.run({
          memoryScope: child.memoryScopeWithSuffix("critique"),
          user: `List 2–3 open questions or gaps about: ${input.topic}`,
        }).result,
      ]);
      return { briefing: briefingEpisode.text, critique: critiqueEpisode.text };
    });
    return { topic: input.topic, summary: briefing, critique };
  },
});
