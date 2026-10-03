import { adl } from "../adl";

/**
 * Several slow steps so the inspector can Pause at a step-enter boundary.
 */
export const slowSteps = adl.createWorkflow({
  id: "slow-steps",
  async run(_input, ctx) {
    for (let i = 0; i < 6; i++) {
      await ctx.step(
        "tick",
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 1_500));
          return i;
        },
        { key: String(i) },
      );
    }
    return { ticks: 6 as const };
  },
});
