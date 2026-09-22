import { z } from "zod";

import { adl } from "#adl";

import { factKeeper } from "../agents/fact-keeper";

function echoesFact(text: string, fact: string): boolean {
  const normalize = (value: string) =>
    value
      .trim()
      .replace(/[.!?]+$/u, "")
      .toLowerCase();
  return normalize(text).includes(normalize(fact));
}

const copyMemoryInput = z.object({
  fact: z.string().default("The secret word is marigold."),
});

/**
 * Two steps share `memoryScopeWithSuffix("thread")`. Retry from **recall**:
 * remember is skipped, and the runtime copies that transcript onto this
 * attempt's scope before recall loads it.
 */
export const copyMemory = adl.createWorkflow({
  id: "copy-memory",
  inputSchema: copyMemoryInput,
  outputSchema: z.object({
    fact: z.string(),
    scope: z.string(),
    remembered: z.string(),
    recalled: z.string(),
    recallIncludesFact: z.boolean(),
  }),
  async run(input, ctx) {
    const { fact } = copyMemoryInput.parse(input);
    await ctx.setTitle(`Copy memory: ${fact}`);
    const scope = ctx.memoryScopeWithSuffix("thread");

    const remembered = await ctx.step("remember", async () => {
      const result = await factKeeper.run({
        memoryScope: scope,
        user: `Remember this fact exactly: ${fact}`,
      }).result;
      return result.text;
    });

    const recalled = await ctx.step("recall", async () => {
      const result = await factKeeper.run({
        memoryScope: scope,
        user: "What fact did I ask you to remember? Reply with that fact only.",
      }).result;
      return result.text;
    });

    return {
      fact,
      scope,
      remembered,
      recalled,
      recallIncludesFact: echoesFact(recalled, fact),
    };
  },
});
