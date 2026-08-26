import { z } from "zod";

import { adl } from "#adl";

import { critic } from "../agents/critic";
import { researcher } from "../agents/researcher";

/** LLM-backed sample workflow. Requires `OPENAI_API_KEY`. Uses OpenAI `web_search`. */
export const literatureReview = adl.createWorkflow({
  id: "literature-review",
  input: z.object({
    topic: z.string().min(1).describe("Research topic to review."),
  }),
  output: z.object({
    topic: z.string(),
    briefing: z.string(),
    critique: z.string(),
    summary: z.string(),
  }),
  run: async (input, ctx) => {
    await ctx.setTitle(`Literature review: ${input.topic}`);

    const sources = await ctx.step("search", async ({ ctx: child }) => {
      const episode = await researcher.run({
        memoryScope: child.memoryScopeWithSuffix("notes"),
        user: `Use web_search to find 3–5 recent papers, surveys, or primary sources on: ${input.topic}. List each with a URL and a one-line takeaway. Do not invent citations.`,
      }).result;
      return episode.text;
    });

    const { briefing, critique } = await ctx.step("analyze", async ({ ctx: child }) => {
      const [briefingText, critiqueText] = await Promise.all([
        child.step("briefing", async ({ ctx: nested }) => {
          const episode = await researcher.run({
            memoryScope: nested.memoryScopeWithSuffix("notes"),
            user: `Write a concise research briefing on ${input.topic} from the sources you found. Cite URLs. Search again only if a key claim is missing.`,
          }).result;
          return episode.text;
        }),
        child.step("critique", async ({ ctx: nested }) => {
          const episode = await critic.run({
            memoryScope: nested.memoryScopeWithSuffix("critique"),
            user: `Topic: ${input.topic}\n\nSources / notes:\n${sources}\n\nList 2–3 open questions or gaps. Use web_search if you need to check a claim. Do not invent citations.`,
          }).result;
          return episode.text;
        }),
      ]);
      return { briefing: briefingText, critique: critiqueText };
    });

    const summary = await ctx.step("synthesize", async ({ ctx: child }) => {
      const episode = await researcher.run({
        memoryScope: child.memoryScopeWithSuffix("notes"),
        user: `Produce a short final summary of ${input.topic}. Address this critique and cite URLs.\n\nCritique:\n${critique}`,
      }).result;
      return episode.text;
    });

    return { topic: input.topic, briefing, critique, summary };
  },
});
