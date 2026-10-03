import { z } from "zod";

import { adl } from "../adl";

/**
 * Wide tree for local INP benches (not CI). Optional `leafDelayMs` keeps the
 * tree live so streaming dual-pane cost is measurable.
 */
export const wideTree = adl.createWorkflow({
  id: "wide-tree",
  inputSchema: z.object({
    groups: z.number().int().min(1).max(20).default(10),
    leavesPerGroup: z.number().int().min(1).max(20).default(8),
    /** Per-leaf pause so a streaming bench can keep the tree live. Default 0. */
    leafDelayMs: z.number().int().min(0).max(1_000).default(0),
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
          await child.step(`leaf-${String(i).padStart(2, "0")}`, async () => {
            if (input.leafDelayMs > 0) {
              await new Promise((resolve) => setTimeout(resolve, input.leafDelayMs));
            }
            return { g, i };
          });
        }
        return { g };
      });
    }
    return { groups: input.groups, leavesPerGroup: input.leavesPerGroup };
  },
});
