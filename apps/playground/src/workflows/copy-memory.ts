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
 * Manual check for `MessageStore.copy` and step scope tracking.
 *
 * `remember` writes a transcript. `copy` snapshots it onto an empty scope.
 * `recall` continues that copy with the same agent, so the prior messages
 * are loaded without running `remember` again. The workflow result reports
 * whether the two transcripts matched and which scopes each step touched.
 */
export const copyMemory = adl.createWorkflow({
  id: "copy-memory",
  inputSchema: copyMemoryInput,
  outputSchema: z.object({
    fact: z.string(),
    sourceScope: z.string(),
    copyScope: z.string(),
    remembered: z.string(),
    recalled: z.string(),
    transcriptsMatch: z.boolean(),
    recallIncludesFact: z.boolean(),
    scopes: z.object({
      remember: z.array(z.string()),
      copy: z.array(z.string()),
      recall: z.array(z.string()),
    }),
  }),
  async run(input, ctx) {
    const { fact } = copyMemoryInput.parse(input);
    await ctx.setTitle(`Copy memory: ${fact}`);
    const sourceScope = ctx.memoryScopeWithSuffix("source");
    const copyScope = ctx.memoryScopeWithSuffix("copy");

    const remembered = await ctx.step("remember", async ({ ctx: stepCtx }) => {
      const result = await factKeeper.run({
        memoryScope: sourceScope,
        user: `Remember this fact exactly: ${fact}`,
      }).result;
      return { text: result.text, scopes: [...stepCtx.accessedMemoryScopes()] };
    });

    const copied = await ctx.step("copy", async ({ ctx: stepCtx }) => {
      await adl.services.stores.message.copy(sourceScope, copyScope);
      const [sourceMessages, copyMessages] = await Promise.all([
        adl.services.stores.message.load(sourceScope),
        adl.services.stores.message.load(copyScope),
      ]);
      return {
        transcriptsMatch: JSON.stringify(sourceMessages) === JSON.stringify(copyMessages),
        scopes: [...stepCtx.accessedMemoryScopes()],
      };
    });

    const recalled = await ctx.step("recall", async ({ ctx: stepCtx }) => {
      const result = await factKeeper.run({
        memoryScope: copyScope,
        user: "What fact did I ask you to remember? Reply with that fact only.",
      }).result;
      return { text: result.text, scopes: [...stepCtx.accessedMemoryScopes()] };
    });

    return {
      fact,
      sourceScope,
      copyScope,
      remembered: remembered.text,
      recalled: recalled.text,
      transcriptsMatch: copied.transcriptsMatch,
      recallIncludesFact: echoesFact(recalled.text, fact),
      scopes: {
        remember: remembered.scopes,
        copy: copied.scopes,
        recall: recalled.scopes,
      },
    };
  },
});
