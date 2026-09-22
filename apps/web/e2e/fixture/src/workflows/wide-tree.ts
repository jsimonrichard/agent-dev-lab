import { z } from "zod";

import { adl } from "../adl";

/**
 * Sync-only wide tree for local INP benches (not CI). Creates many step rows
 * so dual-pane tree/waterfall interaction cost is measurable.
 */
export const wideTree = adl.createWorkflow({
  id: "wide-tree",
  inputSchema: z.object({
    groups: z.number().int().min(1).max(20).default(10),
    leavesPerGroup: z.number().int().min(1).max(20).default(8),
  }),
  outputSchema: z.object({
    groups: z.number(),
    leavesPerGroup: z.number(),
  }),
  async run(input, ctx) {
    await ctx.setTitle(`Wide tree ${input.groups}×${input.leavesPerGroup}`);
    for (let g = 0; g < input.groups; g++) {
      await ctx.step(`group-${String(g).padStart(2, "0")}`, async ({ ctx: child }) => {
        for (let i = 0; i < input.leavesPerGroup; i++) {
          await child.step(`leaf-${String(i).padStart(2, "0")}`, async () => ({ g, i }));
        }
        return { g };
      });
    }
    return { groups: input.groups, leavesPerGroup: input.leavesPerGroup };
  },
});
