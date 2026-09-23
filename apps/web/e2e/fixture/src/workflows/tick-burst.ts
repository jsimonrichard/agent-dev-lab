import { adl } from "../adl";

/**
 * Emits many short steps so the run page stays live across a burst of SSE
 * events — used to catch selection-effect update-depth loops.
 */
export const tickBurst = adl.createWorkflow({
  id: "tick-burst",
  async run(_input, ctx) {
    for (let i = 0; i < 40; i++) {
      await ctx.step(
        "tick",
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 50));
          return i;
        },
        { key: String(i) },
      );
    }
    return { ticks: 40 as const };
  },
});
